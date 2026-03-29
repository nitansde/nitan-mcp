#!/usr/bin/env python3
"""
Nodriver-based Cloudflare cookie extractor.
Launches a real Chrome browser to solve CF managed challenges,
then extracts cookies via JS. Also supports proxying an API request
through the browser to bypass CF entirely.

Input (stdin JSON): {"url": "https://example.com/some/path", "timeout": 60}
Output (stdout JSON): {"success": true, "cookies": {...}, "proxied_response": {...}}
"""

import sys
import os
import json
import asyncio

try:
    import nodriver as uc
    HAS_NODRIVER = True
except ImportError:
    HAS_NODRIVER = False


def output_and_exit(result: dict, code: int = 0):
    """Output JSON result to stdout, flush, and force-exit."""
    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()
    os._exit(code)


async def extract_cookies(base_url: str, api_url: str, timeout: int = 60):
    """Launch Chrome, solve CF challenge, extract cookies, and optionally proxy API request."""
    browser = None
    try:
        browser = await uc.start(
            headless=False,
            browser_args=[
                "--window-position=-32000,-32000",
                "--window-size=1280,720",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-popup-blocking",
            ],
        )

        page = await browser.get(base_url)
        print(f"[DEBUG] Page loaded, polling title...", file=sys.stderr, flush=True)

        elapsed = 0
        poll_interval = 1.0
        cf_resolved = False

        while elapsed < timeout:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

            try:
                title = await page.evaluate("document.title")
                print(f"[DEBUG] title={title!r} elapsed={elapsed:.0f}s", file=sys.stderr, flush=True)
                if title and "just a moment" not in title.lower():
                    await asyncio.sleep(2)
                    cf_resolved = True
                    break
            except Exception:
                pass

        if not cf_resolved:
            output_and_exit({
                "success": False,
                "error": f"CF challenge did not resolve within {timeout}s",
                "error_type": "timeout",
                "cookies": {},
            })

        # Extract JS-accessible cookies
        cookie_str = await page.evaluate("document.cookie")
        cookies = {}
        if cookie_str:
            for pair in cookie_str.split(";"):
                pair = pair.strip()
                if "=" in pair:
                    name, value = pair.split("=", 1)
                    cookies[name.strip()] = value.strip()

        print(f"[DEBUG] Got {len(cookies)} JS cookies", file=sys.stderr, flush=True)

        # Proxy the actual API request through the browser
        # This uses the browser's full session (including httpOnly cookies)
        proxied_response = None
        if api_url:
            print(f"[DEBUG] Proxying API request: {api_url}", file=sys.stderr, flush=True)
            fetch_js = """
            fetch(URL_PLACEHOLDER, {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            }).then(resp => resp.text().then(text => JSON.stringify({ status: resp.status, body: text })))
              .catch(e => JSON.stringify({ status: 0, body: e.message }))
            """.replace("URL_PLACEHOLDER", json.dumps(api_url))

            try:
                raw_result = await asyncio.wait_for(
                    page.evaluate(fetch_js, await_promise=True),
                    timeout=15,
                )
                proxied_response = json.loads(raw_result)
                print(f"[DEBUG] Proxied response status: {proxied_response.get('status')}", file=sys.stderr, flush=True)
            except asyncio.TimeoutError:
                print(f"[DEBUG] Proxied fetch timed out", file=sys.stderr, flush=True)
            except Exception as e:
                print(f"[DEBUG] Proxied fetch error: {e}", file=sys.stderr, flush=True)

        # Stop browser before force-exiting (os._exit skips finally blocks)
        if browser:
            try:
                browser.stop()
            except Exception:
                pass

        output_and_exit({
            "success": True,
            "cookies": cookies,
            "proxied_response": proxied_response,
        })

    except Exception as e:
        print(f"[DEBUG] Error: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        if browser:
            try:
                browser.stop()
            except Exception:
                pass
        output_and_exit({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "cookies": {},
        }, code=1)


def main():
    if not HAS_NODRIVER:
        output_and_exit({
            "success": False,
            "error": "nodriver module not found. Install with: pip install nodriver",
            "error_type": "ImportError",
            "cookies": {},
        })

    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
    except Exception as e:
        output_and_exit({
            "success": False,
            "error": f"Failed to parse stdin: {e}",
            "error_type": "ParseError",
            "cookies": {},
        })

    url = request.get("url", "")
    timeout = request.get("timeout", 60)

    if not url:
        output_and_exit({
            "success": False,
            "error": "No URL provided",
            "error_type": "ValueError",
            "cookies": {},
        })

    from urllib.parse import urlparse
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}/"

    print(f"[DEBUG] Extracting CF cookies for {base_url}", file=sys.stderr, flush=True)

    loop = uc.loop()
    loop.run_until_complete(extract_cookies(base_url, url, timeout))

    output_and_exit({
        "success": False,
        "error": "Unexpected: no result produced",
        "error_type": "InternalError",
        "cookies": {},
    })


if __name__ == "__main__":
    main()
