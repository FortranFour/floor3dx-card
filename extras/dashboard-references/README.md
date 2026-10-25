# Dashboard references (optional frontend resources)

Three small JavaScript modules by the author of floor3dx-card, kept here for people who want them. **None of them is needed to use floor3dx-card, the Rooms Card or the Snapshot Card**, which take ordinary entity ids. They are not a Home Assistant feature.

| File | What it does | Needed for |
|---|---|---|
| `dashboard-card-reference.js` | The runtime: `custom:dashboard-card-reference` renders the saved configuration of a source card elsewhere (a Browser Mod popup, another dashboard, tabs); `custom:dashboard-entity-reference` wraps any card and resolves `[[entity:role]]` tokens from source cards (`card_reference_id` + `entity_reference_id` / `entity_reference_fields` / `entity_reference_extra`) when the card renders. Indexes the saved dashboards over `lovelace/config` once and refreshes on saves. | references |
| `dashboard-component-editor.js` | Wraps Home Assistant's card editor dialog: pick a component inside a stack, wrapper, tab or popup and edit it with its own visual editor on a clean copy; `card_mod`, layout options, visibility and reference metadata are hidden from the native editor and put back on save. This restores the visual editor for **any** card that carries such extras, references or not. | visual editing of styled / nested cards (worth having on its own) |
| `dashboard-reference-editor.js` | The same for the floor3d family inside a wrapper, with their own editors: tokens resolved for editing, ids mapped back to roles on save, `expected_domains` kept current. | references + the 3D cards' editors |

Install: copy the files you want to `/config/www/` (any folder) and add each as a dashboard resource (Settings → Dashboards → ⋮ → Resources → *JavaScript module*), then hard-reload. Storage-mode dashboards are expected; YAML-mode dashboards can be read but not edited this way. Browser Mod is only needed if you use the card references in popups.

A few spots are tuned to the author's own dashboard and harmless elsewhere: the proportional "mail" label in `dashboard-card-reference.js` only touches a text panel bound to `counter.mail_deliveries`; the Utilities/date-selector pairing only fires for source cards with ids `utilities` and `energy_date`; `input_button.floor3d_*` entities are treated as popup hooks rather than bindings. Edit or delete those if they get in your way.

How the convention works, with examples and its limits: the forum post linked from the main README's *Entity references* section. Versions: card-reference 1.2.0, component-editor 1.1.1, reference-editor 1.0.0.
