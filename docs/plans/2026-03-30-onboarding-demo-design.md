# Onboarding Demo Redesign

## Goal
Replace the 6-node "Climb Mount Rainier" tutorial with a 14-node "Summit Mount Kilimanjaro" tree that showcases depth, breadth, and dependency insight.

## Tree Structure

```
Summit Mount Kilimanjaro (goal)
├── No high-altitude experience (constraint)
│   ├── Train cardio 3x/week for 3 months (action)
│   └── Do a practice hike at 10,000ft+ (action)
├── Budget: $3,000–5,000 (constraint)
│   ├── Save $500/month into a trip fund (action)
│   ├── Book a licensed guide company (action)
│   ├── Buy cold-weather gear & layers (action)
│   └── Get travel insurance with evacuation (action)
└── Best summit window: Jan–Mar (consideration)
    ├── Book flights for February (action)
    └── Request 2 weeks off work (action)
```

14 nodes, 3 levels.

## Tutorial Flow (6 steps)

1. **Welcome** — Same overlay, same pitch
2. **The Goal** — Creates "Summit Mount Kilimanjaro" node
3. **The Constraint** — User clicks "+ dep" to add "No high-altitude experience". Then "Budget: $3,000–5,000" auto-appears after ~500ms
4. **The Consideration** — User clicks "+ dep" to add "Best summit window: Jan–Mar"
5. **The Actions** — All 8 actions bloom in simultaneously, cascading branch-by-branch (constraint 1 → constraint 2 → consideration) with ~300ms stagger between each node. This is the wow moment.
6. **Completion** — Congrats modal explaining the pattern

## Key UX Details

- Step 3: Second constraint auto-reveals after ~500ms delay
- Step 5: Actions cascade branch-by-branch with ~300ms stagger between each node
- Camera should auto-pan/zoom to fit the full tree as it blooms in step 5

## What Doesn't Change

- Same 6-step structure and pacing
- Same mechanics (click "+ dep" buttons)
- Same tooltip/overlay UI components
- Same localStorage tracking
