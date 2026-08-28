# loewtorials wizard-authoring spec

You are writing a Markdown file that a small parser will turn into an
interactive, step-by-step wizard on a personal dashboard called
**loewtorials**. Follow this format exactly — the parser is simple and
literal, not an LLM, so structure matters more than prose style.

Output **one single Markdown file** and nothing else (no explanation before
or after it, unless the person asks you questions first — ask those, get
answers, then output the file).

## 1. Frontmatter

Start with a frontmatter block:

```
---
id: short-kebab-case-id
title: Human-readable title shown on the wizard page
subtitle: Optional short subtitle (shown under the title in the sidebar)
category: A category name used for grouping/filtering on the dashboard
tags: tag-one, tag-two, tag-three
date: 2026-08-26
description: One or two sentences shown on the dashboard card.
start: id-of-the-first-step
sourceFiles: some-other-doc.md
relevantPackages: keyd, ntfs-3g
---
```

- `id` should be unique, lowercase, hyphenated. If omitted, one is generated
  from the title.
- `tags` is a comma-separated list.
- `date` is YYYY-MM-DD.
- `start` is optional — if omitted, the wizard starts at the first Step
  block in the document.
- `sourceFiles` is optional — a comma-separated list of other `.md` filenames
  this wizard should answer to (see "Linking to another wizard" below). The
  file you're uploading right now is registered automatically under its own
  filename, so you only need this for *extra* names — e.g. this wizard also
  covers a "round 2" doc that never got uploaded on its own.
- `relevantPackages` is optional — a comma-separated list of package names
  this wizard is about (e.g. the packages a fix depends on). If the person
  has uploaded a system profile with a Containerfile, matching entries show
  up as a small "detected on your system" / "not found in your last
  Containerfile" badge on every step of the wizard. This is wizard-wide, not
  per-step — put every package the wizard as a whole cares about here, even
  if a given package is only relevant to one step.

## Linking to another wizard

If a step, checklist item, or note mentions another `.md` filename — with or
without backticks, e.g. `` `fix-dirty-ntfs-partition.md` `` or plain
`fix-dirty-ntfs-partition.md` — the dashboard automatically turns it into a
link to that wizard, wherever it's found:

```
- [ ] Work through `fix-dirty-ntfs-partition.md`
```

This only works if some wizard on the dashboard actually claims that
filename — either because it was uploaded under that name, or because its
frontmatter lists it under `sourceFiles`. If no match is found, the mention
is just left as plain text (nothing breaks). When it does match, the person
gets a card right in that step with the linked wizard's title, a button to
expand it inline without leaving the page, and a link to open it full-page.
So when you're writing a wizard that says "go work through X.md first," it's
worth checking whether X already exists on the dashboard and, if the person
tells you its wizard id or filename, mentioning it by that exact name.

## 2. Structure: Groups, Steps, Branches, Outcomes

The rest of the document is a sequence of headings. **Document order is the
flow** — a plain Step automatically moves to whatever comes right after it.
You only need to specify a destination explicitly for Branch choices.

### Group heading (organizes the sidebar — optional but recommended)

```
## Group: group-id | Group Label Shown In Sidebar
```

Every `Step` heading after this belongs to this group, until the next
`Group` heading.

### Step heading

```
### Step: step-id | Step title shown on the page
```

Followed by the step's content (see "Content inside a block" below).

### Branch heading (a decision point — shows as a diamond in the sidebar)

```
### Branch: branch-id | The question being asked
```

A branch's body ends with an explicit **Choices** list — this is the one
place you must give explicit destinations:

```
Choices:
- Clean — it's gone -> resolved
- Still dirty -> step-two | Optional banner text shown after picking this
```

Each line is `- Label -> target-id` with an optional `| banner text` after
a pipe. The banner appears as a small callout on the destination step —
useful for "you looped back, here's why."

### Outcome heading (a terminal end-point — no further steps after it)

```
### Outcome: outcome-id | Outcome title (success)
```

The style in parentheses is optional: `success`, `info`, or `warning`
(defaults to `success`). Outcomes are collected automatically and listed
at the bottom of the sidebar.

## 3. Content inside a Step, Branch, or Outcome block

Everything under a heading, until the next heading, is parsed as follows:

- **Fenced code blocks** (\`\`\`) become copyable code snippets. Use one
  fence per distinct command/snippet — multiple fences in one step are
  fine.
- **Blockquote lines** (`> like this`) become a highlighted note callout.
  Multiple consecutive `>` lines are joined into one callout.
- **Checklist lines** (`- [ ] Do the thing`) become interactive checkboxes
  the person can tick off as they go. These are separate from a Branch's
  `Choices:` list — don't mix them in the same block.
- **Everything else** is the step's body text: plain paragraphs (blank
  line = new paragraph), `**bold**`, `*italic*`, `` `inline code` ``, and
  simple `- bullet` or `1. numbered` lists all work.

## 4. Worked example

````
---
id: laptop-wont-boot
title: Laptop won't POST
subtitle: Quick triage before you pull it apart
category: Hardware
tags: laptop, troubleshooting, power
date: 2026-08-26
description: A short decision tree for a laptop that shows no signs of life.
---

## Group: power | Power Checks

### Step: p1 | Check the charger LED
Plug the charger in and look at its indicator light.

> If there's no light on the charger itself, the charger or outlet is the
> first suspect, not the laptop.

- [ ] Charger plugged into a known-good outlet
- [ ] Checked for an LED on the charger brick

### Step: p2 | Try a hard reset
Hold the power button for 15 seconds with the charger unplugged, then
plug back in and try again.

```
Hold power: 15s
Unplug charger, wait 10s, replug, power on
```

### Branch: bp1 | Any sign of life this time?
Fans, lights, or a screen flicker — anything at all counts.

Choices:
- Something happened -> deeper-checks
- Still completely dead -> dead-end

### Outcome: dead-end | Time to open it up (warning)
Get it looked at — this isn't a software issue you can fix from here.

## Group: deeper | Deeper Checks

### Step: deeper-checks | Reseat the battery and RAM
If the laptop has a removable battery or accessible RAM, reseat both.

### Outcome: resolved | Loose connection found (success)
If it powers on now, the issue was a loose connection.
````

That's the whole format. When you're done, output only the finished
Markdown file, ready to upload to the loewtorials dashboard.
