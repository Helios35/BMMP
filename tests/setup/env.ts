// src/data/index.ts resolves the adapter at module load and throws when
// DATA_ADAPTER is missing — that is the behaviour under test elsewhere. Set a
// valid value here so importing the module is possible at all; the selector's
// failure modes are exercised by calling resolveAdapter() with an explicit
// environment rather than by mutating this one.
process.env.DATA_ADAPTER = "mock";
// src/lib/vision/index.ts selects the label reader at module load the same way
// and fails closed on an unset value (D-25). The fixture provider is the only
// one a test may ever spend on.
process.env.VISION_PROVIDER = "fixture";
delete process.env.VERCEL_ENV;
// The permanent origin a printed label's QR points at (src/lib/app-url.ts).
// Playwright pins it to the server it starts; this suite pins a host no
// request is ever sent to.
process.env.NEXT_PUBLIC_APP_URL = "https://bmmp.test";
