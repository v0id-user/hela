defmodule Control.ID do
  @moduledoc "UUIDv7 generator, shared with the gateway. Time-ordered."

  def generate do
    ms = System.system_time(:millisecond)
    <<rand_a::12, rand_b::62, _::6>> = :crypto.strong_rand_bytes(10)

    <<a::32, b::16, c::16, d::16, e::48>> =
      <<ms::unsigned-big-48, 7::4, rand_a::12, 2::2, rand_b::62>>

    [hx(a, 8), "-", hx(b, 4), "-", hx(c, 4), "-", hx(d, 4), "-", hx(e, 12)]
    |> IO.iodata_to_binary()
  end

  def short_project_id do
    "proj_" <>
      (:crypto.strong_rand_bytes(6) |> Base.encode32(case: :lower, padding: false))
  end

  defp hx(n, pad),
    do: n |> Integer.to_string(16) |> String.downcase() |> String.pad_leading(pad, "0")
end
