// .lintstagedrc.cjs
module.exports = {
  "*.{ts,tsx,js,jsx}": [
    'eslint --fix --cache --cache-location .eslintcache --no-error-on-unmatched-pattern --quiet --rule "complexity:warn" --rule "@typescript-eslint/no-explicit-any:warn" --rule "@typescript-eslint/no-unnecessary-condition:warn" --rule "max-lines:warn"',
    "prettier --write",
  ],
  "*.{md,mdx,css,scss,html,yaml,yml}": ["prettier --write"],
};
