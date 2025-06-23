/// <reference types="@netlify/edge-functions" />

import type { Context, Config } from "@netlify/edge-functions";

declare global {
  const Netlify: {
    env: {
      get(key: string): string;
    };
  };
}

// Flutterwave API configuration
const FLUTTERWAVE_API_URL = 'https://api.flutterwave.com/v3';

// Generate a unique tx_ref
function generateTxRef(prefix = 'VA') {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${timestamp}${random}`;
}

export default async (request: Request, context: Context) => {
  // Set security headers
  const securityHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  };

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Method not allowed'
    }), {
      status: 405,
      headers: securityHeaders
    });
  }

  try {
    // Get the request body
    const body = await request.json();

    // Validate required fields
    const requiredFields = ['email', 'firstname', 'lastname', 'phonenumber'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      return new Response(JSON.stringify({
        status: 'error',
        message: `Missing required fields: ${missingFields.join(', ')}`
      }), {
        status: 400,
        headers: securityHeaders
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Invalid email format'
      }), {
        status: 400,
        headers: securityHeaders
      });
    }

    // Validate phone number (basic validation)
    const phoneRegex = /^\d{10,15}$/;
    if (!phoneRegex.test(body.phonenumber)) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Invalid phone number format'
      }), {
        status: 400,
        headers: securityHeaders
      });
    }

    // Prepare the payload
    const payload = {
      email: body.email,
      is_permanent: body.is_permanent ?? true,
      bvn: body.bvn,
      tx_ref: generateTxRef(),
      phonenumber: body.phonenumber,
      firstname: body.firstname,
      lastname: body.lastname,
      narration: `${body.firstname} ${body.lastname} VA`
    };

    // Make request to Flutterwave API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${FLUTTERWAVE_API_URL}/virtual-account-numbers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Netlify.env.get("FLUTTERWAVE_SECRET_KEY")}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    // Return the response
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        ...securityHeaders,
        'Cache-Control': 'no-store, private'
      }
    });

  } catch (error) {
    // Log error for monitoring but don't expose details
    console.error('Virtual Account Creation Error:', error);

    const errorMessage = error.name === 'AbortError' 
      ? 'Request timeout' 
      : 'Internal server error';

    return new Response(JSON.stringify({
      status: 'error',
      message: errorMessage
    }), {
      status: error.name === 'AbortError' ? 408 : 500,
      headers: securityHeaders
    });
  }
};

// Updated config for 2025
export const config: Config = {
  path: "/api/virtual-account",
  cache: "manual",
  onError: "/error", // Custom error page
}; 