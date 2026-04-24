//! REST client tests. Don't touch a real gateway — use wiremock to
//! assert on request shape and exercise the 401/429 error mapping.

use hela::{ErrorKind, HistoryRequest, PublishRequest, Rest, RestOptions, TokenRequest};
use wiremock::matchers::{body_json, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const UUIDV7: &str = "01901234-abcd-7def-8123-456789abcdef";

#[tokio::test]
async fn mint_token_sends_auth_header() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/tokens"))
        .and(header("authorization", "Bearer secret"))
        .and(body_json(serde_json::json!({
            "sub": "user-1",
            "chans": [["read", "chat:*"]],
            "ttl_seconds": 600,
        })))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({"token": "eyJ", "expires_in": 600})),
        )
        .mount(&server)
        .await;

    let rest = Rest::new(
        server.uri(),
        RestOptions {
            api_key: Some("secret".into()),
            ..Default::default()
        },
    );
    let resp = rest
        .mint_token(TokenRequest {
            sub: "user-1".into(),
            chans: Some(vec![vec!["read".into(), "chat:*".into()]]),
            ttl_seconds: Some(600),
            ephemeral: false,
        })
        .await
        .unwrap();
    assert_eq!(resp.token, "eyJ");
    assert_eq!(resp.expires_in, 600);
}

#[tokio::test]
async fn maps_401_to_unauthorized() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/tokens"))
        .respond_with(ResponseTemplate::new(401).set_body_string("bad token"))
        .mount(&server)
        .await;

    let rest = Rest::new(
        server.uri(),
        RestOptions {
            api_key: Some("x".into()),
            ..Default::default()
        },
    );
    let err = rest
        .mint_token(TokenRequest {
            sub: "u".into(),
            chans: None,
            ttl_seconds: None,
            ephemeral: false,
        })
        .await
        .unwrap_err();
    assert_eq!(*err.kind(), ErrorKind::Unauthorized);
}

#[tokio::test]
async fn maps_429_with_body_to_rate_limited() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(format!("/v1/channels/{}/publish", "chat:lobby")))
        .respond_with(
            ResponseTemplate::new(429).set_body_json(serde_json::json!({"retry_after_ms": 420})),
        )
        .mount(&server)
        .await;

    let rest = Rest::new(
        server.uri(),
        RestOptions {
            api_key: Some("x".into()),
            ..Default::default()
        },
    );
    let err = rest
        .publish(
            "chat:lobby",
            PublishRequest {
                body: "x".into(),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    match err.kind() {
        ErrorKind::RateLimited { retry_after_ms } => assert_eq!(*retry_after_ms, 420),
        other => panic!("expected RateLimited, got {other:?}"),
    }
}

#[tokio::test]
async fn maps_429_with_malformed_body_still_rate_limited() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path(format!("/v1/channels/{}/publish", "chat:lobby")))
        .respond_with(ResponseTemplate::new(429).set_body_string("<html>nope</html>"))
        .mount(&server)
        .await;

    let rest = Rest::new(
        server.uri(),
        RestOptions {
            api_key: Some("x".into()),
            ..Default::default()
        },
    );
    let err = rest
        .publish(
            "chat:lobby",
            PublishRequest {
                body: "x".into(),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    match err.kind() {
        ErrorKind::RateLimited { retry_after_ms } => assert_eq!(*retry_after_ms, 0),
        other => panic!("expected RateLimited, got {other:?}"),
    }
}

#[tokio::test]
async fn playground_skips_auth_header() {
    let server = MockServer::start().await;
    // Mount a responder that always succeeds, then inspect the
    // recorded request to confirm the auth header was absent.
    Mock::given(method("POST"))
        .and(path("/playground/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "token": "t",
            "project_id": "proj_public",
            "expires_in": 300,
            "scopes": [],
        })))
        .mount(&server)
        .await;

    let rest = Rest::new(server.uri(), RestOptions::default());
    let resp = rest.playground_token(None).await.unwrap();
    assert_eq!(resp.project_id, "proj_public");

    // Verify the actual request had no authorization header — the
    // point of this test is that playground endpoints skip auth.
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    assert!(
        requests[0].headers.get("authorization").is_none(),
        "playground token request should not carry an authorization header"
    );
}

#[tokio::test]
async fn history_appends_limit_and_before() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/v1/channels/chat:lobby/history"))
        .and(query_param("limit", "25"))
        .and(query_param("before", UUIDV7))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({"source": "cache", "messages": []})),
        )
        .mount(&server)
        .await;

    let rest = Rest::new(
        server.uri(),
        RestOptions {
            api_key: Some("x".into()),
            ..Default::default()
        },
    );
    let page = rest
        .history(
            "chat:lobby",
            HistoryRequest {
                before: Some(UUIDV7.into()),
                limit: Some(25),
            },
        )
        .await
        .unwrap();
    assert_eq!(page.messages.len(), 0);
}
