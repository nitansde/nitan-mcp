#!/usr/bin/env python3
"""
Cloudscraper wrapper for bypassing Cloudflare protection.
This script receives HTTP request details via stdin and outputs the response via stdout.
"""

import sys
import json
import cloudscraper
from typing import Dict, Optional

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
    
    Returns:
        Dictionary containing:
            - status: HTTP status code
            - headers: Response headers
            - body: Response body (text)
            - cookies: Response cookies
    """
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'mobile': False
        }
    )
    
    # Set cookies if provided
    if data.get('cookies'):
        scraper.cookies.update(data['cookies'])
    
    try:
        # Make the request
        response = scraper.request(
            method=data['method'],
            url=data['url'],
            headers=data.get('headers', {}),
            data=data.get('body'),
            timeout=data.get('timeout', 30)
        )
        
        # Extract response cookies
        cookies = {key: value for key, value in response.cookies.items()}
        
        # Return response data
        return {
            'success': True,
            'status': response.status_code,
            'headers': dict(response.headers),
            'body': response.text,
            'cookies': cookies
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
        
        # Write result to stdout
        print(json.dumps(result))
        sys.exit(0)
        
    except json.JSONDecodeError as e:
        error_result = {
            'success': False,
            'error': f'Invalid JSON input: {str(e)}',
            'error_type': 'JSONDecodeError'
        }
        print(json.dumps(error_result))
        sys.exit(1)
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == '__main__':
    main()
