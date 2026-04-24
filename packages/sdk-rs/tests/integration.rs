//! Live-gateway integration. Mirrors scripts/e2e.py / sdk-py /
//! sdk-go. Skipped unless `HELA_LIVE=1`. Defaults point at the
//! deployed Railway stack; override with `HELA_CONTROL` /
//! `HELA_GATEWAY` env vars.
//!
//! Run:
//!
//! ```sh
//! HELA_LIVE=1 cargo test --test integration -- --nocapture
//! ```

use hela::{Config, Region, Rest, RestOptions, TokenRequest};
use std::env;
use std::time::Duration;

struct LiveConfig {
    gateway: String,
    control: String,
}

fn live_config() -> Option<LiveConfig> {
    if env::var("HELA_LIVE").ok().as_deref() != Some("1") {
        return None;
    }
    Some(LiveConfig {
        gateway: env::var("HELA_GATEWAY")
            .unwrap_or_else(|_| "https://gateway-production-bfdf.up.railway.app".into()),
        control: env::var("HELA_CONTROL")
            .unwrap_or_else(|_| "https://control-production-059e.up.railway.app".into()),
    })
}

async fn setup_live(cfg: &LiveConfig) -> (String, String, String) {
    let http = reqwest::Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(20))
        .build()
        .expect("http client");

    let email = format!(
        "sdk-rs-{}@gmail.com",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    // signup
    let signup = http
        .post(format!("{}/auth/signup", cfg.control))
        .json(&serde_json::json!({"email": email}))
        .send()
        .await
        .expect("signup send");
    signup.error_for_status().expect("signup status");

    // create project
    let project: serde_json::Value = http
        .post(format!("{}/api/projects", cfg.control))
        .json(&serde_json::json!({"name": "sdk-rs-smoke", "region": "iad", "tier": "starter"}))
        .send()
        .await
        .expect("project send")
        .json::<serde_json::Value>()
        .await
        .expect("project decode");
    let project_id = project["project"]["id"].as_str().unwrap().to_string();

    // api key
    let key: serde_json::Value = http
        .post(format!("{}/api/projects/{}/keys", cfg.control, project_id))
        .json(&serde_json::json!({"label": "sdk-rs-smoke"}))
        .send()
        .await
        .expect("key send")
        .json::<serde_json::Value>()
        .await
        .expect("key decode");
    let api_key = key["wire"].as_str().unwrap().to_string();

    // mint end-user JWT (retry — control→gateway sync is best-effort)
    let rest = Rest::new(
        &cfg.gateway,
        RestOptions {
            api_key: Some(api_key.clone()),
            ..Default::default()
        },
    );
    let mut token = None;
    for _ in 0..5 {
        match rest
            .mint_token(TokenRequest {
                sub: "end-user-alice".into(),
                chans: Some(vec![
                    vec!["read".into(), "chat:*".into()],
                    vec!["write".into(), "chat:*".into()],
                    vec!["read".into(), "presence:*".into()],
                    vec!["write".into(), "presence:*".into()],
                ]),
                ttl_seconds: Some(600),
            })
            .await
        {
            Ok(t) => {
                token = Some(t.token);
                break;
            }
            Err(_) => tokio::time::sleep(Duration::from_secs(1)).await,
        }
    }

    (
        api_key,
        project_id,
        token.expect("mint_token never succeeded"),
    )
}

#[tokio::test]
async fn live_connect_join_publish_receive() {
    let Some(cfg) = live_config() else {
        eprintln!("skipping: set HELA_LIVE=1 to run");
        return;
    };
    let (_api_key, _project_id, user_token) = setup_live(&cfg).await;

    let client = hela::connect(Config {
        region: Region::Iad,
        token: Some(user_token),
        endpoint: Some(cfg.gateway.clone()),
        ..Default::default()
    })
    .await
    .expect("connect");

    let chat = client.channel("chat:lobby");
    let (tx, mut rx) = tokio::sync::mpsc::channel::<hela::Message>(16);
    let tx_clone = tx.clone();
    chat.on_message(move |m| {
        let _ = tx_clone.try_send(m);
    });

    let reply = chat
        .join(hela::JoinRequest {
            nickname: Some("alice".into()),
        })
        .await
        .expect("join");
    assert_eq!(reply.region, "iad");

    let pub_reply = chat
        .publish(hela::PublishRequest {
            body: "hello from sdk-rs".into(),
            author: Some("alice".into()),
            ..Default::default()
        })
        .await
        .expect("publish");

    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        tokio::select! {
            Some(m) = rx.recv() => {
                if m.id == pub_reply.id {
                    assert_eq!(m.body, "hello from sdk-rs");
                    client.close().await;
                    return;
                }
            }
            _ = tokio::time::sleep_until(deadline) => {
                panic!("never received self-broadcast");
            }
        }
    }
}

#[tokio::test]
async fn live_rate_limited_is_typed() {
    let Some(cfg) = live_config() else {
        return;
    };
    let (api_key, _project_id, _token) = setup_live(&cfg).await;

    let rest = Rest::new(
        &cfg.gateway,
        RestOptions {
            api_key: Some(api_key),
            ..Default::default()
        },
    );

    // Fire 60 publishes; at Starter-tier 15/sec, several must 429.
    let mut handles = Vec::with_capacity(60);
    for _ in 0..60 {
        let rest_ref = &rest;
        handles.push(async move {
            rest_ref
                .publish(
                    "rl-test",
                    hela::PublishRequest {
                        body: "burst".into(),
                        author: Some("bot".into()),
                        ..Default::default()
                    },
                )
                .await
        });
    }
    let results = futures_util::future::join_all(handles).await;
    let rate_limited = results
        .iter()
        .filter(|r| {
            matches!(
                r.as_ref().err().map(|e| e.kind()),
                Some(hela::ErrorKind::RateLimited { .. })
            )
        })
        .count();
    assert!(rate_limited > 0, "rate limiter never tripped");
}
