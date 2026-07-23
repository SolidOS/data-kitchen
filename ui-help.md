# How to do each operation

**Entry point:** **☰ → Customize** opens *Customize Plugins, Menus, & buttons* — the **Plugins Available** shelf on the left, the **menu** and **top-row buttons** editors on the right.

Legend: 🖱 = in the Customize UI · ✍ = edit the RDF directly (no UI) · ▶ = runtime, in the normal app

## Plugin

- **Add** — 🖱 **＋ add** at the top of *Plugins Available* → fill the form.
- **Remove** — 🖱 a card's **✕** ("Remove from the catalog" — deletes entry + manifest).
- **Edit properties** — 🖱 a card's (or chip's) **✎** opens the entry form:
  - *Where displayed* — the **region** field
  - *Describe & categorize* — the **description** + **topics** fields
  - *Parameters/attributes* — the **attributes** rows
  - *Available when not logged in* — the **if-logged-in** field
- **Browse by category** — 🖱 the **topic tabs** across the top of *Plugins Available*.
- **Attach to a UI element** — 🖱 **drag** a card onto a menu row or the bar (phone: tap the card → **Add to…** → pick a menu).
- **Detach** — 🖱 drag the chip off the row, or its **✕** (phone) / the row's remove button.
- **Reorder** — 🖱 the row's **▲ ▼** move buttons.
- **Activate** — ▶ click it in the normal menu/bar.
- **Display help page** — ▶ the app's **?** button.
- **Display settings/data form** — ▶ shown by the plugin itself (a `sol-form` generated from its shape).

## Menu / UI-element

- **Add a submenu** — 🖱 type a name in a menu editor's **add row**. *(Top-level menus and the bar are fixed shells — not created via the UI.)*
- **Remove** — 🖱 the row's remove button.
- **Name it** — 🖱 click the row's **name** and type.
- **How items flow (orientation)** / **default display target (region)** — ✍ set on the menu in its RDF; the editor preserves them but won't change them.
- **Nest** — 🖱 make a submenu (add-row name), then drag plugins onto that row.
- **Populate** — 🖱 drag plugins onto the menu (or its add row).
- **Reorder items** — 🖱 the row's **▲ ▼** move buttons.
- **Open / collapse** — ▶ click it in the app.

## Layout & placement

- **Choose a placed item's display surface** — 🖱 set its **region** in the ✎ entry form (Tab, Modal, Floating, Window, Dropdown, …).
- **Everything structural** — add/remove regions, orientation, columns, semantic role (nav/header/footer/sidebar), nesting, the app's root layout — ✍ **no current UI**; edit the layout RDF directly.
