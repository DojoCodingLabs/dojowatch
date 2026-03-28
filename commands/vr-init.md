---
description: Initialize DojoWatch for this project — generates config and route map
---

# Visual Regression Init

Initialize DojoWatch in the current project. This sets up the configuration, discovers routes, and creates initial baselines.

## Steps

1. **Check for existing config.** If `.dojowatch/config.json` does not exist, read the template at `${CLAUDE_PLUGIN_ROOT}/templates/config.example.json` and create `.dojowatch/config.json` with sensible defaults for this project.

2. **Detect project framework.** Read `package.json` and the file structure to identify:
   - Framework: Next.js (app/ or pages/), Vite, Remix, Astro, etc.
   - Dev server URL and port (default `http://localhost:3000`)
   - Whether Storybook is configured (check for `.storybook/` directory)

3. **Discover routes.** Based on the framework:
   - **Next.js App Router**: Glob for `app/**/page.{tsx,jsx,ts,js}` and derive URL paths
   - **Next.js Pages Router**: Glob for `pages/**/*.{tsx,jsx,ts,js}` excluding `_app`, `_document`, `api/`
   - **Vite/Other**: Read router config or ask the user for routes
   - **Storybook**: Note the Storybook URL for story-level capture

4. **Generate route map.** Create `.dojowatch/routeMap.json` mapping source files to their visual routes. Format:
   ```json
   {
     "routes": {
       "/": ["app/page.tsx", "app/layout.tsx"],
       "/dashboard": ["app/dashboard/page.tsx", "components/DashboardChart.tsx"]
     },
     "stories": {}
   }
   ```

5. **Create directories.** Ensure `.dojowatch/baselines/` and `.dojowatch/captures/` exist.

6. **Confirm with user.** Show the discovered config and route map. Ask if the user wants to adjust anything before proceeding.

7. **Initial capture.** If the user confirms, remind them to start their dev server, then run:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/capture.ts --config .dojowatch/config.json --scope all
   ```

8. **Promote to baselines.** Run:
   ```bash
   npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/baseline.ts --promote --all
   ```

9. **Report.** Summarize: number of routes captured, viewports used, baseline count.
