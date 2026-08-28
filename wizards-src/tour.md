---
id: tour
title: Tour of loewtorials
subtitle: What this dashboard is and how to use it
category: Meta
tags: tour, guide, getting-started
date: 2026-08-26
description: A short, interactive walkthrough of everything loewtorials can do — wizards, uploading your own, linking, mark-solved, and appearance settings.
start: welcome
---

## Group: basics | What This Is

### Step: welcome | Welcome to loewtorials
loewtorials is a personal dashboard of interactive, step-by-step guides
called **wizards**. Each one walks you through a tutorial or troubleshooting
flow one screen at a time, instead of dumping a wall of text on you.

This tour is itself a wizard — everything you're clicking through right now
works the same way any wizard you write or upload will work.

- [ ] I'm looking at the wizard player right now (rail on the side, step in the middle)

### Step: anatomy | The parts of a wizard
On the left is the **rail** — a map of every group, step, decision point,
and outcome in this wizard, so you always know where you are and how much
is left. On the right (or below, on mobile) is the **stage** — the current
step's content.

> Steps can contain body text, copyable code blocks, a checklist you tick
> off as you go, and callout notes like this one.

## Group: authoring | How Wizards Are Built

### Step: steps-groups | Groups and Steps
A wizard's markdown source is just a sequence of headings: `Group`, `Step`,
`Branch`, and `Outcome`. Steps inside a `Group` heading get bundled together
in the rail's sidebar so related steps show up as one visual cluster.

Document order **is** the flow — a plain step automatically moves to
whichever step comes right after it in the file. You don't wire up "next"
by hand unless you're branching.

### Branch: try-a-branch | Want to see how a decision point works?
A **Branch** is a step that asks a question and offers a few labeled
choices instead of a single "Next" button — shown as a diamond in the rail.
Try picking one below (either is fine, they both continue the tour).

Choices:
- Show me the branches/outcomes step -> branches-outcomes | Good choice — branches are how a wizard adapts to what actually happened during a run, not just a fixed script.
- Skip ahead to outcomes -> branches-outcomes

### Step: branches-outcomes | Branches and Outcomes
Branches let a wizard fork based on what's actually true for the person
running it — "did that fix it?", "which error did you get?" — instead of
forcing everyone down one linear path.

An **Outcome** is a terminal step — a place a wizard ends, styled as
success, info, or warning. Every outcome in a wizard gets listed at the
bottom of the rail automatically, so you can see all the possible endings
at a glance even before you reach one.

## Group: linking | Wizards Linking to Wizards

### Step: linking | The auto-linked-reference mechanic
If a step, checklist item, or note mentions another wizard's `.md`
filename — like `some-other-wizard.md` — and some wizard on this dashboard
actually claims that filename, the mention turns into a live card right in
that step: the linked wizard's title, a button to walk it inline without
leaving the page, and a link to open it full-page.

- [ ] Nothing to check here — this step just explains the mechanic. It only
      activates when a real filename match exists on your dashboard.

A wizard claims a filename either automatically (under whatever name you
uploaded it as) or explicitly via a `sourceFiles:` frontmatter field, which
can even point at one specific step instead of the wizard's start.

## Group: uploading | Adding Your Own Wizards

### Step: uploading | Custom wizard upload
Back on the dashboard, the **"+ New wizard"** button has two tabs. "Upload /
paste .md" is for a wizard file you already have — drag it in, or paste its
contents directly. "Get one written" downloads the authoring spec and a
starter prompt meant for a fresh Claude conversation: describe what you
want walked through, attach the spec, and Claude hands back a finished
`.md` file ready to drop into the other tab.

> Uploaded wizards live in this browser's local storage — per-device, since
> this is a static site with no server. Use a card's "Export JSON" action
> if you want to carry one to another device or make it a permanent
> built-in wizard.

## Group: wrapping-up | Tracking What You've Done

### Step: mark-solved | Mark solved / finished
Every wizard player has a **"Mark solved / finished"** button in the rail.
It opens a review of the exact path you just took — which steps, which
branch choices, which checklist items — and asks a quick tap-only question
per step (defaulting to "went as written," so confirming a clean run takes
zero typing). Saving downloads a `.md` summary of that run, meant to be
handed to a fresh AI chat as a trace of what's already been tried.

- [ ] Try opening that button now, if you want to see the review screen

### Step: activity-log | The activity log
The dashboard also has an **activity log** download, which rolls up every
completion across every wizard on this device into one `.md` file — a
running record of everything you've solved, when, and how it went.

## Group: personalizing | Making It Yours

### Step: appearance | Appearance settings
The gear icon (top of the rail, and on the dashboard) opens settings for
theme, font, background, layout width, sidebar gap, and text scale — all
applied live as you adjust them, and remembered on this device.

### Outcome: tour-done | You've seen the whole dashboard (success)
That's everything: wizards are just markdown, they can branch and link to
each other, uploading is drag-and-drop, and every run you finish gets
tracked without you having to type a report by hand. Head back to the
dashboard and either open a real wizard or write your first one.
