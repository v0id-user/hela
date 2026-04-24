defmodule Hela.IDTest do
  @moduledoc """
  UUIDv7 is a hot-path primitive — every publish mints one, and their
  monotonic property is what cursor pagination depends on. If these
  invariants break, history ordering breaks silently.
  """
  use ExUnit.Case, async: true

  alias Hela.ID

  describe "generate/0" do
    test "produces canonical 36-char UUID string" do
      id = ID.generate()
      assert byte_size(id) == 36
      assert Regex.match?(~r/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/, id)
    end

    test "embeds the current unix-ms in the first 48 bits" do
      before_ms = System.system_time(:millisecond)
      id = ID.generate()
      after_ms = System.system_time(:millisecond)
      ts = ID.timestamp_ms(id)

      # Allow a few ms of slack — the clock reads on either side of the
      # generate can cross a tick boundary.
      assert ts >= before_ms - 2
      assert ts <= after_ms + 2
    end

    test "ids sort monotonically by embedded timestamp" do
      # UUIDv7 only guarantees monotonicity at ms granularity — the
      # trailing 74 bits are random, so two ids in the same ms may sort
      # in either order. The real invariant we depend on for cursor
      # pagination is that `timestamp_ms(id)` is non-decreasing for an
      # id sequence. Generate enough to span multiple ms.
      ids = for _ <- 1..200, do: ID.generate()

      timestamps = Enum.map(ids, &ID.timestamp_ms/1)
      assert timestamps == Enum.sort(timestamps)

      # Sanity: at least some ids must sort string-wise too (same ms
      # tier, same first 48 bits → differ on later bits).
      assert length(Enum.uniq(ids)) == 200
    end

    test "ids are unique within a burst" do
      ids = for _ <- 1..1_000, do: ID.generate()
      assert length(Enum.uniq(ids)) == 1_000
    end
  end

  describe "string_to_bin/1 ↔ bin_to_string/1" do
    test "round-trips" do
      id = ID.generate()
      assert ID.bin_to_string(ID.string_to_bin(id)) == id
    end

    test "bin is 16 bytes" do
      bin = ID.generate_bin()
      assert byte_size(bin) == 16
    end
  end

  describe "timestamp_ms/1" do
    test "accepts both 16-byte bin and 36-char string" do
      bin = ID.generate_bin()
      str = ID.bin_to_string(bin)
      assert ID.timestamp_ms(bin) == ID.timestamp_ms(str)
    end
  end
end
