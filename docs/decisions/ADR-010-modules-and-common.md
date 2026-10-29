# ADR-010: Features in `src/modules`, shared code in `src/common`

**Context.** The first layout put all eleven feature folders flat in `src/`, next to shared
folders such as `config`, `database`, `crypto` and `currencies`. Nothing showed which code was
a feature and which was shared, and two shared files imported from feature modules (the
database options imported the account entities, and the endpoint decorator imported the
route-access metadata from `auth`).

**Decision.** Every feature is a Nest module under `src/modules/`. Everything several modules
share lives under `src/common/`. Code in `common/` never imports from `modules/`, and a unit
test (`test/unit/common/layering.spec.ts`) fails if it does. The account entities are handed
to the database options by `AppModule`, and the route-access metadata moved to
`common/http/route-access.ts`. `test/unit/` mirrors the same split.

**Why.** It is the layout Nest projects usually grow into, it makes the dependency direction
obvious (modules depend on common, never the reverse), and a reviewer can find a feature in
one place.

**Consequences.** One commit moved 66 files; git keeps each file's history as a rename. Routes,
behaviour and the OpenAPI document did not change. A new shared helper must not reach into a
module; if it needs something from one, the module passes it in.
