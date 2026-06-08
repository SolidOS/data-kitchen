# Calendar feed URLs — where to find each provider's iCalendar export

`sol-calendar`'s `dct:source` predicate (see `data/calendar-settings.ttl`) takes
**iCalendar (ICS) export URLs** — feeds that return `text/calendar`
content starting with `BEGIN:VCALENDAR`.

**These are NOT the URL of the calendar page in your browser.** Calendar
UI URLs like `https://calendar.google.com/calendar/u/0/r/month/…` return
HTML and will fail with "Proxy returned a non-ICS body" or similar.

## Where to find the iCal export URL by provider

### Google Calendar

1. Go to [calendar.google.com](https://calendar.google.com/).
2. Hover the calendar in **My calendars** in the left sidebar.
3. Click ⋮ → **Settings and sharing**.
4. Scroll to **Integrate calendar**.

Two URLs are exposed:

- **Secret address in iCal format** — works for ANY calendar (public or
  private). The long token in the URL IS the credential, so being
  logged in to Google in another tab does NOT grant access — the
  secret URL does. **Treat it like a password**: don't commit it to a
  public repo, don't share it. Rotate from the same settings page if
  it leaks.
- **Public address in iCal format** — appears only after ticking
  **Make available to public** above. Safe to share.

For a PUBLIC calendar you can also set `dct:format "google"` and use
the calendar's public iCal URL; sol-calendar handles either feed
style transparently.

### Apple iCloud

1. Open the Calendar app.
2. Right-click the calendar → **Share Calendar** → **Public Calendar**.
3. Copy the URL.
4. Swap `webcal://` for `https://`.

### Outlook

1. Go to [outlook.live.com](https://outlook.live.com/).
2. **Settings** → **Calendar** → **Shared calendars** → **Publish a calendar**.
3. Copy the **ICS link**.

### Proton Calendar

1. Go to [calendar.proton.me](https://calendar.proton.me/).
2. Open the calendar's settings.
3. **Share publicly** → copy the **"Subscribe with calendar app"** link.

### Self-hosted / Solid pod

Any URL that returns `text/calendar` works.

## Sanity check before saving

```
curl <url>
```

The first line of the response should be `BEGIN:VCALENDAR`. The next
few lines look like:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//…
…
```

If you see HTML (`<!DOCTYPE html>` or similar), you grabbed a UI URL —
go back to the provider's settings and look for "iCal" / "ICS" /
"Subscribe."

## After leaks

If you accidentally publish a Google "secret" iCal URL: rotate from
calendar.google.com's Integrate calendar panel as soon as possible.
The old URL stops working immediately and a new token replaces it.
