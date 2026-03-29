# Save & Share Design

## Problem

The URL hash auto-updates on every change. If you bookmark a URL, it's a snapshot — you'd need to re-bookmark after every edit or lose your work. There's no intentional save moment.

## Solution

Replace auto-save with a manual Save button. Each save encodes the current state into the URL hash, shows the user the link, and stashes it in localStorage for easy resumption.

## Save Button

- Added to the toolbar/header area
- On click: encode nodes+edges into URL hash, save URL to `localStorage` (`deeproot-last-save`), show the save modal

## Save Modal

- Displays the full URL (selectable text)
- "Copy to clipboard" button
- Explanatory text: "Your Deeproot is saved in this URL. Every save creates a unique link — share it freely. Others can remix or branch from your map without affecting your version. No account needed."

## Load Behavior

| URL has hash | localStorage has save | `?new=1` param | Result                                          |
| ------------ | --------------------- | --------------- | ----------------------------------------------- |
| Yes          | Any                   | Any             | Load from hash directly                         |
| No           | Yes                   | No              | Prompt: "We found a previous Deeproot. Load it?" |
| No           | No                    | Any             | Blank canvas, tutorial                          |
| No           | Any                   | Yes             | Skip prompt, blank canvas, strip `?new=1` param |

## Resume Prompt

When localStorage has a previous save but no hash is in the URL:
- Show a prompt with two options: load previous map or start fresh
- If "load": navigate to the stored URL (which contains the hash)
- If "start fresh": blank canvas, tutorial flow

## Onboarding Update

Add a step in the tutorial explaining the save/share model:
- Maps live in URLs, no account needed
- Every save creates a unique link
- Share freely — others can remix without affecting your version
- Save as many different maps as you want via bookmarks

## What Changes From Today

- **Remove**: auto-save to URL hash on every state change (`useEffect` that calls `saveToHash`)
- **Add**: Save button, save modal, localStorage `deeproot-last-save`, resume prompt on bare load
- **Keep**: hash encoding/decoding logic (`saveToHash`/`loadFromHash`), tutorial system (with additions)
