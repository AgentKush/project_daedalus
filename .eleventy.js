module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "public/assets": "assets", "public/data": "data" });
  // Static JSON API (versioned). Same JSON files exposed under /api/v1/*.json
  // so external consumers (mod managers, Discord bots, future tooling) have a
  // stable URL contract independent of the /data/ paths the site itself uses.
  eleventyConfig.addPassthroughCopy({
    "public/data/mods.json": "api/v1/mods.json",
    "public/data/tools.json": "api/v1/tools.json",
    "public/data/nexus_mods.json": "api/v1/nexus_mods.json",
    "public/data/info_content.json": "api/v1/info_content.json"
  });

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"]
  };
};
