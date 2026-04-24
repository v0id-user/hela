defmodule Control.IDTest do
  @moduledoc """
  Control's ID generator parallels the gateway's. Same UUIDv7 invariants
  — a bug here causes project/account IDs to lose monotonicity, which
  breaks joins and ordering in invoices.
  """
  use ExUnit.Case, async: true

  alias Control.ID

  describe "generate/0" do
    test "is a 36-char UUID string" do
      id = ID.generate()
      assert byte_size(id) == 36
      assert Regex.match?(~r/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/, id)
    end

    test "monotonic by embedded timestamp in a burst" do
      # UUIDv7 guarantees monotonicity at ms granularity, not sub-ms.
      # The first 48 bits (time) are non-decreasing; the trailing 74
      # bits (random) are not ordered within a millisecond.
      ids = for _ <- 1..200, do: ID.generate()
      timestamps = Enum.map(ids, fn id -> String.slice(id, 0, 13) end)
      assert timestamps == Enum.sort(timestamps)
      assert length(Enum.uniq(ids)) == 200
    end
  end

  describe "short_project_id/0" do
    test "has the proj_ prefix" do
      id = ID.short_project_id()
      assert String.starts_with?(id, "proj_")
    end

    test "is base32-ish after prefix" do
      "proj_" <> body = ID.short_project_id()
      assert Regex.match?(~r/^[a-z2-7]+$/, body)
      # short enough for URLs, long enough to not collide
      assert byte_size(body) >= 6
    end

    test "collision-resistant across a burst" do
      ids = for _ <- 1..1_000, do: ID.short_project_id()
      assert length(Enum.uniq(ids)) == 1_000
    end
  end
end
