#!/usr/bin/env python3
"""
Cloudscraper wrapper for bypassing Cloudflare protection.
This script receives HTTP request details via stdin and outputs the response via stdout.
Supports session persistence and login functionality.
"""

import sys
import json
import cloudscraper
from typing import Dict, Optional

# Try to import brotli for decompression support
try:
    import brotli
    HAS_BROTLI = True
except ImportError:
    HAS_BROTLI = False
    print("[WARNING] brotli module not found. Install with: pip3 install brotli", file=sys.stderr)

# Global scraper instance to maintain session across requests
_scraper_instance: Optional[cloudscraper.CloudScraper] = None
_base_url: Optional[str] = None

def get_scraper(base_url: str) -> cloudscraper.CloudScraper:
    """Get or create a cloudscraper instance with session persistence."""
    global _scraper_instance, _base_url
    
    # Create new scraper if URL changed or doesn't exist
    if _scraper_instance is None or _base_url != base_url:
        _scraper_instance = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'mobile': False,
                'desktop': True
            }
        )
        _base_url = base_url
        
        # Warm up session with base URL
        try:
            _scraper_instance.get(base_url, timeout=10, allow_redirects=True)
        except Exception:
            pass  # Ignore warm-up errors
    
    return _scraper_instance

def fetch_csrf_token(scraper: cloudscraper.CloudScraper, base_url: str) -> Optional[str]:
    """Fetch CSRF token from /session/csrf.json."""
    try:
        response = scraper.get(
            f"{base_url}/session/csrf.json",
            timeout=10,
            headers={'Accept': 'application/json'}
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get('csrf')
            if token:
                # Store token in session headers
                scraper.headers['X-CSRF-Token'] = token
                return token
        else:
            print(f"ERROR: Failed to obtain CSRF token: HTTP {response.status_code}", file=sys.stderr)
            print(f"ERROR: 获取 CSRF 令牌失败：HTTP {response.status_code}", file=sys.stderr)
            print(f"ERROR: This usually means Cloudflare challenge bypass failed", file=sys.stderr)
            print(f"ERROR: 这通常意味着 Cloudflare 挑战绕过失败", file=sys.stderr)
            print(f"ERROR: Response preview: {response.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"ERROR: Failed to fetch CSRF token: {e}", file=sys.stderr)
        print(f"ERROR: 获取 CSRF 令牌失败：{e}", file=sys.stderr)
        print(f"ERROR: This usually means Cloudflare challenge bypass failed", file=sys.stderr)
        print(f"ERROR: 这通常意味着 Cloudflare 挑战绕过失败", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    return None

def login(scraper: cloudscraper.CloudScraper, base_url: str, username: str, password: str, 
          second_factor_token: Optional[str] = None) -> Dict:
    """Login to Discourse forum."""
    try:
        # Get CSRF token first
        csrf_token = fetch_csrf_token(scraper, base_url)
        if not csrf_token:
            return {
                'success': False,
                'error': 'Failed to obtain CSRF token',
                'error_type': 'AuthenticationError'
            }
        
        # Prepare login data
        login_data = {
            'login': username,
            'password': password,
            'remember': True
        }
        if second_factor_token:
            login_data['second_factor_token'] = second_factor_token
        
        # Send login request
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Referer': f"{base_url}/login",
            'X-CSRF-Token': csrf_token,
            'X-Requested-With': 'XMLHttpRequest'
        }
        
        response = scraper.post(
            f"{base_url}/session.json",
            json=login_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            return {
                'success': True,
                'status': 200,
                'body': json.dumps(result),
                'message': 'Login successful',
                'csrf_token': csrf_token
            }
        else:
            return {
                'success': False,
                'status': response.status_code,
                'error': f'Login failed with status {response.status_code}',
                'error_type': 'AuthenticationError',
                'body': response.text
            }
    
    except Exception as e:
        return {
            'success': False,
            'error': f'Login exception: {str(e)}',
            'error_type': type(e).__name__
        }

def make_request(data: Dict) -> Dict:
    """
    Make an HTTP request using cloudscraper.
    
    Args:
        data: Dictionary containing:
            - url: The URL to request
            - method: HTTP method (GET, POST, etc.)
            - headers: Dict of headers
            - body: Optional request body (for POST/PUT)
            - cookies: Optional dict of cookies
            - timeout: Optional timeout in seconds
            - login: Optional dict with 'username' and 'password' for authentication
    
    Returns:
        Dictionary containing:
            - status: HTTP status code
            - headers: Response headers
            - body: Response body (text)
            - cookies: Response cookies
            - csrf_token: CSRF token if available
    """
    # Extract base URL for session management
    url = data['url']
    base_url = '/'.join(url.split('/')[:3])  # Extract scheme://host
    
    scraper = get_scraper(base_url)
    
    # Set cookies if provided (these may include session cookies from previous requests)
    if data.get('cookies'):
        scraper.cookies.update(data['cookies'])
        print(f"[DEBUG] Applied {len(data['cookies'])} cookies to scraper: {list(data['cookies'].keys())}", file=sys.stderr)
    
    # Only attempt login if:
    # 1. Login credentials are provided AND
    # 2. We don't have a session cookie yet
    should_login = False
    if data.get('login'):
        login_info = data['login']
        username = login_info.get('username')
        password = login_info.get('password')
        
        # Check if we already have session cookies
        has_session = False
        session_cookie_names = ['_t', '_forum_session', 'authentication_data']
        
        # Check both scraper cookies and incoming cookies
        all_cookies = set(scraper.cookies.keys())
        if data.get('cookies'):
            all_cookies.update(data['cookies'].keys())
        
        print(f"[DEBUG] All available cookies: {list(all_cookies)}", file=sys.stderr)
        
        for cookie_name in session_cookie_names:
            if cookie_name in all_cookies:
                has_session = True
                print(f"[DEBUG] Found session cookie: {cookie_name}", file=sys.stderr)
                break
        
        # Only login if we have credentials and no session
        if username and password and not has_session:
            should_login = True
            print(f"[DEBUG] No session found, will attempt login for {username}", file=sys.stderr)
            second_factor = login_info.get('second_factor_token')
            login_result = login(scraper, base_url, username, password, second_factor)
            if not login_result.get('success'):
                return login_result
        elif has_session:
            print(f"[DEBUG] Session exists, skipping login", file=sys.stderr)
    
    try:
        # Make the request
        response = scraper.request(
            method=data['method'],
            url=data['url'],
            headers=data.get('headers', {}),
            data=data.get('body'),
            timeout=data.get('timeout', 30)
        )
        
        # Extract ALL cookies from scraper session (not just response cookies)
        # This includes cf_clearance and other Cloudflare cookies
        cookies = {key: value for key, value in scraper.cookies.items()}
        print(f"[DEBUG] Returning {len(cookies)} cookies to Node.js: {list(cookies.keys())}", file=sys.stderr)
        
        # Get CSRF token if available
        csrf_token = scraper.headers.get('X-CSRF-Token')
        
        # Ensure body is properly decoded as text
        # The requests library should auto-decode gzip, but let's ensure it
        try:
            content_encoding = response.headers.get('Content-Encoding', '').lower()
            
            # If brotli compressed and we have the library, decompress manually
            if content_encoding == 'br' and HAS_BROTLI:
                print(f"[DEBUG] Manually decompressing Brotli content", file=sys.stderr)
                decompressed = brotli.decompress(response.content)
                body_text = decompressed.decode('utf-8', errors='replace')
            else:
                # Force encoding detection if not set
                if response.encoding is None or response.encoding == 'ISO-8859-1':
                    # Try to detect from content-type or default to utf-8
                    response.encoding = response.apparent_encoding or 'utf-8'
                
                # Get the text content - this should handle gzip automatically
                body_text = response.text
            
            # Verify it's actually decoded
            print(f"[DEBUG] Response encoding: {response.encoding}", file=sys.stderr)
            print(f"[DEBUG] Content-Encoding header: {response.headers.get('Content-Encoding', 'none')}", file=sys.stderr)
            print(f"[DEBUG] Response body length: {len(body_text)} chars", file=sys.stderr)
            print(f"[DEBUG] Response body preview (first 200 chars): {body_text[:200]}", file=sys.stderr)
            
            # Check if body looks like JSON
            if body_text.strip().startswith('{') or body_text.strip().startswith('['):
                print(f"[DEBUG] Body appears to be JSON", file=sys.stderr)
            else:
                print(f"[DEBUG] WARNING: Body does not appear to be JSON!", file=sys.stderr)
                print(f"[DEBUG] First bytes as hex: {body_text[:50].encode('latin1', errors='ignore').hex()}", file=sys.stderr)
                
        except Exception as e:
            print(f"[DEBUG] Failed to decode response body: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            # Fallback: try to decode as utf-8
            body_text = response.content.decode('utf-8', errors='replace')
        
        # Return response data
        return {
            'success': True,
            'status': response.status_code,
            'headers': dict(response.headers),
            'body': body_text,
            'cookies': cookies,
            'csrf_token': csrf_token,
            'logged_in': should_login  # Indicate if we just logged in
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }

def main():
    """Main entry point - reads from stdin, processes request, writes to stdout."""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Make the request
        result = make_request(input_data)
        
        # Write result to stdout with explicit encoding
        output = json.dumps(result, ensure_ascii=True)
        sys.stdout.write(output)
        sys.stdout.flush()
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        error_result = {
            'success': False,
            'error': f'Invalid JSON input: {str(e)}',
            'error_type': 'JSONDecodeError'
        }
        output = json.dumps(error_result, ensure_ascii=True)
        sys.stdout.write(output)
        sys.stdout.flush()
        sys.exit(1)
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }
        output = json.dumps(error_result, ensure_ascii=True)
        sys.stdout.write(output)
        sys.stdout.flush()
        sys.exit(1)

if __name__ == '__main__':
    main()
