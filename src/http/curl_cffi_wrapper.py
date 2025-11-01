#!/usr/bin/env python3
"""
curl_cffi wrapper for bypassing Cloudflare protection.
This script receives HTTP request details via stdin and outputs the response via stdout.
Supports session persistence and login functionality.
curl_cffi provides better Cloudflare bypass than cloudscraper by impersonating real browsers.
"""

import sys
import json
from typing import Dict, Optional

try:
    from curl_cffi import requests
    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False
    print("[ERROR] curl_cffi module not found. Install with: pip3 install curl-cffi", file=sys.stderr)
    sys.exit(1)

# Global session instance to maintain state across requests
_session_instance: Optional[requests.Session] = None
_base_url: Optional[str] = None

def get_session(base_url: str) -> requests.Session:
    """Get or create a curl_cffi session with browser impersonation."""
    global _session_instance, _base_url
    
    # Create new session if URL changed or doesn't exist
    if _session_instance is None or _base_url != base_url:
        # Use chrome110 impersonation for better Cloudflare compatibility on datacenter IPs
        _session_instance = requests.Session(impersonate="chrome110")
        _base_url = base_url
        
        # Warm up session with base URL to establish Cloudflare cookies
        # This is critical for datacenter/cloud IPs that trigger Cloudflare challenges
        try:
            print(f"[DEBUG] Warming up session for {base_url} (critical for cloud IPs)...", file=sys.stderr)
            warmup_response = _session_instance.get(base_url, timeout=15, allow_redirects=True)
            print(f"[DEBUG] Warmup response status: {warmup_response.status_code}", file=sys.stderr)
            
            # Check if we got Cloudflare cookies
            cf_cookies = [k for k in _session_instance.cookies.keys() if k.startswith('cf_') or k.startswith('__cf')]
            if cf_cookies:
                print(f"[DEBUG] Obtained Cloudflare cookies: {cf_cookies}", file=sys.stderr)
            else:
                print(f"[DEBUG] No Cloudflare cookies yet (may be added on next request)", file=sys.stderr)
                
        except Exception as e:
            print(f"[WARNING] Session warm-up failed: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
    
    return _session_instance

def fetch_csrf_token(session: requests.Session, base_url: str) -> Optional[str]:
    """Fetch CSRF token from /session/csrf.json."""
    try:
        response = session.get(
            f"{base_url}/session/csrf.json",
            timeout=10,
            headers={'Accept': 'application/json'}
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get('csrf')
            if token:
                # Store token in session headers
                session.headers['X-CSRF-Token'] = token
                print(f"[DEBUG] Obtained CSRF token: {token[:20]}...", file=sys.stderr)
                return token
        else:
            print(f"[ERROR] Failed to obtain CSRF token: HTTP {response.status_code}", file=sys.stderr)
            print(f"[ERROR] 获取 CSRF 令牌失败：HTTP {response.status_code}", file=sys.stderr)
            print(f"[ERROR] This usually means Cloudflare challenge bypass failed", file=sys.stderr)
            print(f"[ERROR] 这通常意味着 Cloudflare 挑战绕过失败", file=sys.stderr)
            print(f"[ERROR] Response preview: {response.text[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] Failed to fetch CSRF token: {e}", file=sys.stderr)
        print(f"[ERROR] 获取 CSRF 令牌失败：{e}", file=sys.stderr)
        print(f"[ERROR] This usually means Cloudflare challenge bypass failed", file=sys.stderr)
        print(f"[ERROR] 这通常意味着 Cloudflare 挑战绕过失败", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    return None

def login(session: requests.Session, base_url: str, username: str, password: str, 
          second_factor_token: Optional[str] = None) -> Dict:
    """Login to Discourse forum."""
    try:
        # Get CSRF token first
        csrf_token = fetch_csrf_token(session, base_url)
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
        
        print(f"[DEBUG] Attempting login for user: {username}", file=sys.stderr)
        response = session.post(
            f"{base_url}/session.json",
            json=login_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"[DEBUG] Login successful for {username}", file=sys.stderr)
            return {
                'success': True,
                'status': 200,
                'body': json.dumps(result),
                'message': 'Login successful',
                'csrf_token': csrf_token
            }
        else:
            print(f"[ERROR] Login failed with status {response.status_code}", file=sys.stderr)
            return {
                'success': False,
                'status': response.status_code,
                'error': f'Login failed with status {response.status_code}',
                'error_type': 'AuthenticationError',
                'body': response.text
            }
    
    except Exception as e:
        print(f"[ERROR] Login exception: {e}", file=sys.stderr)
        return {
            'success': False,
            'error': f'Login exception: {str(e)}',
            'error_type': type(e).__name__
        }

def make_request(data: Dict) -> Dict:
    """
    Make an HTTP request using curl_cffi.
    
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
            - success: Boolean indicating success/failure
            - status: HTTP status code
            - headers: Response headers
            - body: Response body (text)
            - cookies: Response cookies
            - csrf_token: CSRF token if available
            - error: Error message if failed
            - error_type: Error type if failed
    """
    # Extract base URL for session management
    url = data['url']
    base_url = '/'.join(url.split('/')[:3])  # Extract scheme://host
    
    session = get_session(base_url)
    
    # Set cookies if provided (these may include session cookies from previous requests)
    if data.get('cookies'):
        session.cookies.update(data['cookies'])
        print(f"[DEBUG] Applied {len(data['cookies'])} cookies: {list(data['cookies'].keys())}", file=sys.stderr)
    
    # Check if this is a public endpoint that doesn't need authentication
    # Skipping login for these improves reliability on cloud IPs
    public_endpoints = ['/about.json', '/site.json', '/categories.json', '/tags.json', '/latest.json']
    is_public_endpoint = any(url.endswith(endpoint) or endpoint in url for endpoint in public_endpoints)
    
    # Only attempt login if:
    # 1. Login credentials are provided AND
    # 2. We don't have a session cookie yet AND
    # 3. This is NOT a public endpoint
    should_login = False
    if data.get('login') and not is_public_endpoint:
        login_info = data['login']
        username = login_info.get('username')
        password = login_info.get('password')
        
        # Check if we already have session cookies
        has_session = False
        session_cookie_names = ['_t', '_forum_session', 'authentication_data']
        
        # Check both session cookies and incoming cookies
        all_cookies = set(session.cookies.keys())
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
            login_result = login(session, base_url, username, password, second_factor)
            if not login_result.get('success'):
                # Don't fail the entire request if login fails - might still work for public content
                print(f"[WARNING] Login failed but continuing with request: {login_result.get('error')}", file=sys.stderr)
            else:
                print(f"[DEBUG] Login completed successfully", file=sys.stderr)
        elif has_session:
            print(f"[DEBUG] Session exists, skipping login", file=sys.stderr)
    elif is_public_endpoint and data.get('login'):
        print(f"[DEBUG] Skipping login for public endpoint: {url}", file=sys.stderr)
    
    try:
        # Make the request
        print(f"[DEBUG] Making {data['method']} request to {url}", file=sys.stderr)
        response = session.request(
            method=data['method'],
            url=url,
            headers=data.get('headers', {}),
            data=data.get('body'),
            timeout=data.get('timeout', 30)
        )
        
        print(f"[DEBUG] Response status: {response.status_code}", file=sys.stderr)
        
        # Extract ALL cookies from session (not just response cookies)
        # This includes cf_clearance and other Cloudflare cookies
        cookies = {key: value for key, value in session.cookies.items()}
        print(f"[DEBUG] Returning {len(cookies)} cookies: {list(cookies.keys())}", file=sys.stderr)
        
        # Get CSRF token if available
        csrf_token = session.headers.get('X-CSRF-Token')
        
        # Get response body as text
        try:
            body_text = response.text
            print(f"[DEBUG] Response body length: {len(body_text)} chars", file=sys.stderr)
            print(f"[DEBUG] Response body preview (first 200 chars): {body_text[:200]}", file=sys.stderr)
            
            # Check if body looks like JSON
            if body_text.strip().startswith('{') or body_text.strip().startswith('['):
                print(f"[DEBUG] Body appears to be JSON", file=sys.stderr)
            else:
                print(f"[DEBUG] WARNING: Body does not appear to be JSON", file=sys.stderr)
        except Exception as e:
            print(f"[ERROR] Failed to decode response body: {e}", file=sys.stderr)
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
        error_msg = str(e)
        error_type = type(e).__name__
        print(f"[ERROR] Request failed: {error_type}: {error_msg}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            'success': False,
            'error': error_msg,
            'error_type': error_type
        }

def main():
    """Main entry point - reads from stdin, processes request, writes to stdout."""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        print(f"[DEBUG] Received request for: {input_data.get('method', 'GET')} {input_data.get('url', 'unknown')}", file=sys.stderr)
        
        # Make the request
        result = make_request(input_data)
        
        # Write result to stdout with explicit encoding
        output = json.dumps(result, ensure_ascii=True)
        sys.stdout.write(output)
        sys.stdout.flush()
        
        exit_code = 0 if result.get('success') else 1
        print(f"[DEBUG] Exiting with code {exit_code}", file=sys.stderr)
        sys.exit(exit_code)
        
    except json.JSONDecodeError as e:
        error_result = {
            'success': False,
            'error': f'Invalid JSON input: {str(e)}',
            'error_type': 'JSONDecodeError'
        }
        print(f"[ERROR] Invalid JSON input: {e}", file=sys.stderr)
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
        print(f"[ERROR] Unhandled exception: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        output = json.dumps(error_result, ensure_ascii=True)
        sys.stdout.write(output)
        sys.stdout.flush()
        sys.exit(1)

if __name__ == '__main__':
    main()
