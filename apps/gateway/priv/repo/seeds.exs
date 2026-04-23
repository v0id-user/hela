pid = Application.fetch_env!(:hela, :playground)[:project_id]

# Seed the gateway's projects_cache with the public playground row.
# In prod the control plane would push this via /_internal/projects —
# we stub it in dev so mix ecto.setup leaves the gateway runnable alone.
case Hela.Repo.get(Hela.Projects.Row, pid) do
  nil ->
    Hela.Projects.upsert(%{
      id: pid,
      account_id: "acc_public",
      tier: "free",
      region: Hela.region(),
      jwt_public_key_jwk: nil
    })

    IO.puts("> seeded playground project #{pid} into projects_cache")

  _ ->
    IO.puts("> playground project already cached, skipping")
end
