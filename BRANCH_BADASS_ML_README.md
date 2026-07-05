# BADASS ML ARROW COUNTER v2 - New Branch

## Branch Purpose
This branch supercharges your arrow-counter app with real Machine Learning, automatic group size detection from photos, advanced analytics, and makes it THE BADDEST archery analysis app on the planet. Built on your existing React + TS + Vite + shadcn + Capacitor foundation.

Your original 8 features are the base. We implement/enhance all of them + 10+ new killer features focused on ML + auto everything.

## How to use this branch
1. git checkout badass-ml-arrow-group-v2
2. The new component is in src/components/AutoGroupMLAnalyzer.tsx
3. Add to your UI (e.g. in TuningTools or new tab)
4. npm install @tensorflow/tfjs (optional for advanced ML)
5. Test on device with camera

## What was added
- Full AutoGroupMLAnalyzer React component with canvas photo analysis, manual calibration (tap edge), auto CV detection of arrow holes, live group stats, MOA, windage, ML trend prediction
- Complete TypeScript types for archery domain (ArrowImpact, GroupStats, CalibratedTarget, Session, etc.)
- Pure TS utils for group math, heuristic CV (flood fill blob detection), linear regression ML, MOA conversion
- Integration patch and research notes

This makes the app immediately usable for photo-based auto group analysis and ML coaching. The existing ArrowAIAnalyzer and TuningTools can be extended with this logic.

Push this, iterate, add the model training pipeline next. This is the foundation for the undisputed #1 archery training app.

Let's fucking go. No limits.