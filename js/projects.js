/*
 * projects.js — the ONE list of projects on this site.
 *
 * The sidebar is built from this array. To add a project:
 *   1. Copy the finished project into  projects/<slug>/
 *   2. Add one object below. The order here = the order in the sidebar.
 *
 * Fields:
 *   slug    — short id, used in the URL:  #/projects/<slug>
 *   title   — name shown in the sidebar
 *   tagline — one short line describing the project
 *   tools   — list of tools used (shown as little tags)
 *   path    — the page to open, relative to index.html
 *   tldr    — 3–4 sentence summary shown by the TL;DR button at the top of the project
 */
window.PROJECTS = [
  {
    slug: "pharma-sales",
    title: "Pharma Sales Project",
    tagline: "Pharmacy sales analysis with weather and Google Trends data",
    tools: ["SQL"],
    path: "projects/pharma-sales/index.html",
    tldr: "Using SQL (SQLite), I analyzed almost six years (2014–2019) of monthly sales from a pharmacy in " +
          "Niš, Serbia, across 8 drug classes, joined with local weather and Google Trends searches. Pain and " +
          "fever drugs make up about half of all sales (49.3%), while airway and allergy drugs grew the most: " +
          "airway drugs about doubled from 2014 to 2018. Antihistamines peak in spring and pain/fever and " +
          "airway drugs in winter, and these seasonal sales track searches and the weather even after " +
          "removing long-term trends. Searches don't predict prescription drugs like anxiolytics and sedatives."
  },
  {
    slug: "epa-ghgrp",
    title: "EPA Emissions Project",
    tagline: "Which US sectors, companies and states emit the most greenhouse gases (EPA GHGRP 2023)",
    tools: ["SQL"],
    path: "projects/epa-ghgrp/index.html",
    tldr: "Using SQL (SQLite), I analyzed the US EPA's Greenhouse Gas Reporting Program: direct emissions " +
          "from 6,470 large facilities in 2023, linked to the companies that own them. Power plants produce " +
          "62.6% of these emissions, the top 10 companies are almost all power companies, and Texas alone " +
          "emits 15.9%, more than the next two states combined. Comparing company totals over time was " +
          "misleading because of renamed and sold companies, so I compared the same facilities in 2019 and " +
          "2023: American Electric Power, Duke Energy and Berkshire Hathaway made the biggest real cuts."
  },
  {
    slug: "masld",
    title: "MASLD Project",
    tagline: "Diet, energy intake and MASLD risk in Filipino adults (ENNS, survey-weighted)",
    tools: ["R"],
    path: "projects/masld/index.html",
    tldr: "Using R, I ran survey-weighted analyses of 121,042 Filipino adults from the Expanded National " +
          "Nutrition Survey (ENNS 2018, 2019 and 2021) to see how what people ate on the recall day relates " +
          "to the risk factors that define MASLD (fatty liver disease). Eating more energy went with a larger " +
          "body size (BMI and waist-to-height ratio) in every sex and age group, most steeply in adults 60+. " +
          "A higher share of energy from fat instead of carbohydrate went with slightly higher “good” HDL cholesterol " +
          "in every group. These patterns repeated across all three survey years and held after accounting " +
          "for smoking and physical activity."
  }
];
