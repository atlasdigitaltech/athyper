"use client";
import { PageHeader } from "@athyper/platform-shell";
import { useMeshAccountContext } from "@athyper/product-mesh-shell";
export default function BuyerDiscoveryPage() {
  const context = useMeshAccountContext(),
    buyers = context.accounts.filter(
      (account) => account.role === "buyer" || account.role === "both",
    ),
    selected = buyers.find(
      (account) =>
        account.networkAccountId === context.selected?.networkAccountId,
    );
  return (
    <div>
      <PageHeader
        level="collection"
        title="Buyer Discovery"
        description="Discover partners through your buyer network account."
      />
      <section className="athyper-governance-list">
        <h2>Buyer network account</h2>
        {context.status === "loading" ? (
          <p>Loading authorized accounts…</p>
        ) : context.status === "error" ? (
          <button onClick={context.retry}>Retry loading accounts</button>
        ) : buyers.length ? (
          <>
            <label>
              Acting buyer account
              <select
                value={selected?.networkAccountId ?? ""}
                onChange={(event) => context.select(event.target.value)}
              >
                <option value="" disabled>
                  Select a buyer account
                </option>
                {buyers.map((account) => (
                  <option
                    key={account.networkAccountId}
                    value={account.networkAccountId}
                  >
                    {account.code} · {account.displayName}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <p>
                Connected as {selected.displayName}. Network partner search and
                linking to your tenant directory will be available in a later
                phase.
              </p>
            ) : (
              <p>Select your authorized buyer account to continue.</p>
            )}
          </>
        ) : (
          <p>No buyer network account is available for your current access.</p>
        )}
      </section>
    </div>
  );
}
