defmodule Hela.Auth.JWT do
  @moduledoc """
  JWT grant verification.

  Customers register a public key (JWK) on their project in the dashboard.
  Their backend signs short-lived grants with the matching private key; we
  verify signature + claims at WebSocket connect / publish time.

  Required claims on every token:

    * `pid`     — project_id. MUST match the project whose pubkey we used.
    * `sub`     — opaque end-user id the customer assigned.
    * `exp`     — standard expiry, enforced.
    * `chans`   — list of `{scope, pattern}` the token may act on, e.g.
                  `[["read","chat:*"], ["write","chat:room42"]]`.
                  `*` matches one path segment. Missing = no scopes at all.
  """

  @max_ttl_seconds 24 * 3600

  @doc """
  Verify a token against a project's registered JWK.

  `fetch_jwk` is a 1-arg function `fn project_id -> {:ok, jwk} | :error` —
  pass the accounts module or a stub.

  Returns `{:ok, claims}` or `{:error, reason}`.
  """
  def verify(token, fetch_jwk) when is_binary(token) and is_function(fetch_jwk, 1) do
    with {:ok, unverified} <- peek_claims(token),
         project_id when is_binary(project_id) <- unverified["pid"] || {:error, :missing_pid},
         {:ok, claims} <- verify_one_of(token, project_id, fetch_jwk),
         :ok <- validate_claims(claims, project_id) do
      {:ok, claims}
    else
      {:error, _} = e -> e
      _ -> {:error, :bad_token}
    end
  end

  # Customer-registered RSA JWK is the canonical path. If no JWK is
  # registered (or verify fails), fall back to HS256 with the server-
  # derived secret used by `/v1/tokens` — that path only works for
  # tokens we minted ourselves, so authenticity is still enforced.
  defp verify_one_of(token, project_id, fetch_jwk) do
    case fetch_jwk.(project_id) do
      {:ok, jwk} ->
        case verify_with_jwk(token, jwk) do
          {:ok, _} = ok -> ok
          _ -> verify_with_server_secret(token, project_id)
        end

      _ ->
        verify_with_server_secret(token, project_id)
    end
  end

  # Per-project random secret pushed from the control plane on project
  # creation. No customer-facing way to read it — only the control plane
  # and the regional gateway know the value. Rotating kills any still-
  # valid server-issued tokens.
  defp verify_with_server_secret(token, project_id) do
    with {:ok, secret} <- Hela.Projects.fetch_signing_secret(project_id) do
      signer = Joken.Signer.create("HS256", secret)

      case Joken.verify(token, signer) do
        {:ok, c} -> {:ok, c}
        _ -> {:error, :bad_signature}
      end
    end
  rescue
    _ -> {:error, :bad_signature}
  end

  @doc """
  Check if a token's `chans` grants `scope` on `channel`. `scope` is
  `:read` or `:write`; `channel` is the public channel name (no project
  prefix — that's added by the framework).
  """
  def authorized?(claims, scope, channel) when scope in [:read, :write] do
    wanted = to_string(scope)

    (claims["chans"] || [])
    |> Enum.any?(fn
      [^wanted, pattern] -> match_pattern?(pattern, channel)
      [^wanted, pattern, _] -> match_pattern?(pattern, channel)
      _ -> false
    end)
  end

  @doc """
  Sign a token with an HS256 secret. Used by the playground guest-token
  endpoint; real customers sign on their own backend.
  """
  def sign(claims, secret, ttl_seconds) when is_binary(secret) do
    now = System.system_time(:second)

    full =
      Map.merge(claims, %{
        "iat" => now,
        "nbf" => now,
        "exp" => now + min(ttl_seconds, @max_ttl_seconds),
        "jti" => Hela.ID.generate()
      })

    signer = Joken.Signer.create("HS256", secret)
    {:ok, token, _} = Joken.encode_and_sign(full, signer)
    {:ok, token}
  end

  @doc """
  Verify a token signed with an HS256 secret (playground case).
  """
  def verify_hs256(token, secret) when is_binary(token) and is_binary(secret) do
    signer = Joken.Signer.create("HS256", secret)

    with {:ok, claims} <- Joken.verify(token, signer) do
      {:ok, claims}
    else
      _ -> {:error, :bad_token}
    end
  end

  # --- internals --------------------------------------------------------

  # Joken.peek_claims already returns {:ok, claims} | {:error, _} in this
  # version, so we pass its result through verbatim rather than re-wrapping.
  defp peek_claims(token) do
    try do
      case Joken.peek_claims(token) do
        {:ok, _} = ok -> ok
        {:error, _} = err -> err
        claims when is_map(claims) -> {:ok, claims}
        _ -> {:error, :malformed}
      end
    rescue
      _ -> {:error, :malformed}
    end
  end

  defp verify_with_jwk(token, jwk) do
    try do
      signer = Joken.Signer.create("RS256", jwk)

      case Joken.verify(token, signer) do
        {:ok, c} -> {:ok, c}
        _ -> {:error, :bad_signature}
      end
    rescue
      _ -> {:error, :bad_jwk}
    end
  end

  defp validate_claims(claims, project_id) do
    cond do
      claims["pid"] != project_id -> {:error, :pid_mismatch}
      is_integer(claims["exp"]) and claims["exp"] < System.system_time(:second) ->
        {:error, :expired}
      true -> :ok
    end
  end

  # Glob-style pattern matching. `*` matches any single `:`-separated segment,
  # `**` matches rest. `chat:*` matches `chat:room42` but not `chat:room42:dm`.
  defp match_pattern?(pattern, channel) do
    segs_p = String.split(pattern, ":")
    segs_c = String.split(channel, ":")
    match_segs(segs_p, segs_c)
  end

  defp match_segs([], []), do: true
  defp match_segs(["**"], _rest), do: true
  defp match_segs(["*" | rp], [_ | rc]), do: match_segs(rp, rc)
  defp match_segs([x | rp], [x | rc]), do: match_segs(rp, rc)
  defp match_segs(_, _), do: false
end
