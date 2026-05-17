package acr.browser.lightning.search.engine

import acr.browser.lightning.R

/**
 * The Eesha (SearXNG) search engine.
 * Privacy-focused metasearch engine.
 */
class EeshaSearch : BaseSearchEngine(
    "file:///android_asset/eesha.png",
    "https://eesha-search.onrender.com/search?q=",
    R.string.search_engine_eesha
)
