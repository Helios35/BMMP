// src/data/index.ts resolves the adapter at module load and throws when
// DATA_ADAPTER is missing — that is the behaviour under test elsewhere. Set a
// valid value here so importing the module is possible at all; the selector's
// failure modes are exercised by calling resolveAdapter() with an explicit
// environment rather than by mutating this one.
process.env.DATA_ADAPTER = "mock";
delete process.env.VERCEL_ENV;
