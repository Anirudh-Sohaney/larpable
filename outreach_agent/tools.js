const axios = require('axios');
const cheerio = require('cheerio');

async function search_internet(query) {
    try {
        // 100% headless backend web engine approach via DuckDuckGo HTML
        const response = await axios.get('https://html.duckduckgo.com/html/', {
            params: { q: query },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.result').each((i, el) => {
            if (i >= 5) return false; // Get top 5 results
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const link = $(el).find('.result__url').attr('href') || '';
            // DuckDuckGo redirects urls, extract real url if possible
            const realUrlMatch = link.match(/uddg=([^&]+)/);
            const finalUrl = realUrlMatch ? decodeURIComponent(realUrlMatch[1]) : link;
            
            if (title && snippet) {
                results.push(`Title: ${title}\nURL: ${finalUrl}\nSnippet: ${snippet}`);
            }
        });

        if (results.length === 0) return "No results found.";
        return results.join("\n\n").substring(0, 4000);
    } catch (error) {
        // Fallback to minimal search if rate-limited
        try {
            const fb = await axios.get(`https://s.jina.ai/${encodeURIComponent(query)}`, { timeout: 10000 });
            return fb.data.substring(0, 4000);
        } catch (e) {
            return `Search failed for query: ${query}. Error: ${error.message}`;
        }
    }
}

async function read_webpage(url) {
    try {
        // 1. Ultra-fast direct scrape to extract only essential text
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        
        const $ = cheerio.load(response.data);

        // Remove html noise, scripts, footers, headers, ads, and sidebars
        $('script, style, noscript, iframe, img, svg, nav, footer, header, aside, form').remove();
        $('[class*="ad"], [id*="ad"], [class*="footer"], [id*="footer"]').remove();
        $('[class*="sidebar"], [class*="menu"], [class*="nav"], [class*="cookie"]').remove();

        // Extract pure essential text and aggressively clean whitespace
        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').trim();
        
        // If content is too short, fallback to Jina reader which uses Headless Chrome
        if (text.length < 150) throw new Error("Content too sparse");

        return text.substring(0, 4000);

    } catch (error) {
        // 2. Fallback to Jina Reader if blocked by anti-bot (Cloudflare, etc.) or JS-heavy
        try {
            const jinaRes = await axios.get(`https://r.jina.ai/${url}`, {
                headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
                timeout: 15000
            });
            return jinaRes.data.substring(0, 4000);
        } catch (fallbackErr) {
            return `Read failed for url: ${url}. Error: ${fallbackErr.message}`;
        }
    }
}

module.exports = {
    search_internet,
    read_webpage
};
