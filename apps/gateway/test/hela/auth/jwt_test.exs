defmodule Hela.Auth.JWTTest do
  @moduledoc """
  JWT verify is the tenant boundary — a bug here means anyone can
  impersonate another project. We test the scope matcher standalone
  (no DB) so it can't silently drift.
  """
  use ExUnit.Case, async: true

  alias Hela.Auth.JWT

  describe "authorized?/3 — scope matcher" do
    test "exact pattern match" do
      claims = %{"chans" => [["read", "chat:room42"]]}
      assert JWT.authorized?(claims, :read, "chat:room42")
      refute JWT.authorized?(claims, :read, "chat:room41")
      refute JWT.authorized?(claims, :write, "chat:room42")
    end

    test "single-segment glob (`*`) matches one path segment only" do
      claims = %{"chans" => [["read", "chat:*"]]}
      assert JWT.authorized?(claims, :read, "chat:room42")
      refute JWT.authorized?(claims, :read, "chat:room42:dm"), "* should not match across :"
      refute JWT.authorized?(claims, :read, "chat")
    end

    test "double-star (`**`) matches the rest" do
      claims = %{"chans" => [["read", "chat:**"]]}
      assert JWT.authorized?(claims, :read, "chat:room42")
      assert JWT.authorized?(claims, :read, "chat:room42:dm:bob")
    end

    test "empty chans denies everything" do
      refute JWT.authorized?(%{"chans" => []}, :read, "anything")
      refute JWT.authorized?(%{}, :read, "anything")
    end

    test "read grant does not imply write" do
      claims = %{"chans" => [["read", "chat:*"]]}
      refute JWT.authorized?(claims, :write, "chat:room42")
    end
  end

  describe "sign/3 + verify_hs256/2" do
    test "sign and verify round-trip" do
      claims = %{"pid" => "proj_test", "sub" => "user-1", "chans" => []}
      secret = "test-secret-abcdef0123456789"

      {:ok, token} = JWT.sign(claims, secret, 300)
      assert {:ok, decoded} = JWT.verify_hs256(token, secret)
      assert decoded["pid"] == "proj_test"
      assert decoded["sub"] == "user-1"
    end

    test "verify rejects tampered token" do
      {:ok, token} = JWT.sign(%{"pid" => "x"}, "secret", 300)
      {:error, _} = JWT.verify_hs256(token <> "tampered", "secret")
    end

    test "verify rejects wrong secret" do
      {:ok, token} = JWT.sign(%{"pid" => "x"}, "secret-1", 300)
      {:error, _} = JWT.verify_hs256(token, "secret-2")
    end

    test "TTL is clamped to max" do
      # @max_ttl_seconds is 24*3600. Passing a huge ttl should not yield
      # a token valid for a year.
      {:ok, token} = JWT.sign(%{"pid" => "x"}, "secret", 10_000_000)
      {:ok, claims} = JWT.verify_hs256(token, "secret")
      assert claims["exp"] - claims["iat"] <= 24 * 3600
    end
  end
end
