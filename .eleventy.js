module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "public/assets": "assets", "public/data": "data" });

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"]
  };
};
