defmodule HelaWeb.RegionController do
  use HelaWeb, :controller

  # The landing page uses this to populate the region selector.
  @regions [
    %{slug: "iad", city: "Ashburn, US East", host: "gateway-production-bfdf.up.railway.app"},
    %{slug: "sjc", city: "San Jose, US West", host: "gateway-production-bfdf.up.railway.app"},
    %{slug: "ams", city: "Amsterdam, EU", host: "gateway-production-bfdf.up.railway.app"},
    %{slug: "sin", city: "Singapore, Asia", host: "gateway-production-bfdf.up.railway.app"},
    %{slug: "syd", city: "Sydney, AU", host: "gateway-production-bfdf.up.railway.app"}
  ]

  def index(conn, _) do
    # `region` is the slug this gateway reports as — same field name
    # used in JoinReply and the HELA_REGION env var. Keep the noun
    # consistent everywhere the gateway names its own identity.
    json(conn, %{regions: @regions, region: Hela.region()})
  end

  def ping(conn, %{"slug" => slug}) do
    # This endpoint lands on whichever region the browser actually opened
    # a WebSocket to — it replies with the region *this node* is running
    # in, and the client measures round-trip. The `slug` is just for the
    # client's log line; we echo it back so it can confirm DNS went where
    # it thought.
    json(conn, %{
      asked_for: slug,
      served_by: Hela.region(),
      node: to_string(node()),
      t: System.system_time(:millisecond)
    })
  end
end
