import Link from "next/link";
import { FIXTURES } from "@athyper/entity-runtime/header";

export default function HeaderFixturesIndex() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">EntityHeader Fixtures</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Six canonical model shapes. Each renders at expanded / collapsed / pinned.
        </p>
      </div>
      <ul className="space-y-2">
        {Object.keys(FIXTURES).map(key => (
          <li key={key}>
            <Link
              href={`/header-fixtures/${key}`}
              className="text-sm font-medium hover:underline text-foreground"
            >
              {key}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
