import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { devices, installations } from "@/lib/mock-data"
import { DeviceList } from "./device-list"

export default function TokensPage() {
  return (
    <>
      <PageHeader title="Tokens & orgs" description="Machines linked with npx npxhub, and where the GitHub App is installed." />

      <Card>
        <CardHeader>
          <CardTitle>Linked machines</CardTitle>
          <CardDescription>
            Revoking a machine signs its CLI out on the next call. Unused links expire after 90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeviceList initial={devices} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>GitHub App installations</CardTitle>
          <CardDescription>npxhub never stores an npm token. Publishing uses trusted publishing from your own workflows.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {installations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 px-3 py-2.5">
                <span className="font-medium">{i.accountLogin}</span>
                <span className="text-muted-foreground">
                  {i.repos} repo{i.repos === 1 ? "" : "s"}
                  {i.suspended && " · suspended"}
                </span>
                <a
                  href={`https://github.com/organizations/${i.accountLogin}/settings/installations/${i.id}`}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  Configure
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
