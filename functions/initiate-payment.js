// Netlify function to initiate SwiftPay STK Push payment
const { supabase } = require('./supabase');

// SwiftPay API credentials
const SWIFTPAY_API_KEY = process.env.SWIFTPAY_API_KEY;
const SWIFTPAY_TILL_ID = process.env.SWIFTPAY_TILL_ID;
const SWIFTPAY_BACKEND_URL = process.env.SWIFTPAY_BACKEND_URL || 'https://swiftpay-backend-uvv9.onrender.com';

function normalizePhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  }
  if (cleaned.length !== 12 || !/^\d+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // Process POST request
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }
  
  try {
    const requestBody = JSON.parse(event.body);
    const { phoneNumber, amount = 149, description = 'FARE Account Activation', username, email } = requestBody;
    
    console.log('Parsed request:', { phoneNumber, amount, description });
    
    if (!phoneNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Phone number is required' })
      };
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid phone number format. Use 07XXXXXXXX or 254XXXXXXXXX' 
        })
      };
    }
    
    // Generate a unique reference for this payment
    const externalReference = `SURV-${Date.now()}`;
    
    // Save application data to applications table
    if (username && email) {
      try {
        const ipAddress = event.headers['x-forwarded-for'] || event.headers['client-ip'] || '';
        const userAgent = event.headers['user-agent'] || '';
        
        await supabase
          .from('applications')
          .insert({
            project_name: 'SURVAYREBORN',
            full_name: username,
            email: email,
            phone: phoneNumber,
            project_data: {
              accountType: 'premium',
              activationFee: amount,
              description: description,
              registeredAt: new Date().toISOString()
            },
            payment_reference: externalReference,
            payment_status: 'unpaid',
            payment_amount: amount,
            ip_address: ipAddress.split(',')[0].trim(),
            user_agent: userAgent
          });
        
        console.log('Application data saved for:', username);
      } catch (dbError) {
        console.error('Failed to save application data:', dbError);
        // Continue with payment even if save fails
      }
    }
    
    // Prepare SwiftPay payload
    const swiftpayPayload = {
      phone_number: normalizedPhone,
      amount: amount,
      till_id: SWIFTPAY_TILL_ID
    };
    
    console.log('Making API request to SwiftPay');
    
    // Call SwiftPay API endpoint
    const response = await fetch(`${SWIFTPAY_BACKEND_URL}/api/mpesa/stk-push-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SWIFTPAY_API_KEY}`,
      },
      body: JSON.stringify(swiftpayPayload),
    });

    const responseText = await response.text();
    console.log('SwiftPay response status:', response.status);
    console.log('SwiftPay response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse SwiftPay response:', responseText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ 
          success: false,
          message: 'Invalid response from payment service' 
        }),
      };
    }

    // Check if request was successful
    if (response.ok && (data.success === true || data.status === 'success')) {
      const checkoutId = data.data?.checkout_id || data.data?.request_id || data.CheckoutRequestID || externalReference;
      
      // Store transaction in Supabase
      try {
        const { error: dbError } = await supabase
          .from('transactions')
          .insert({
            transaction_request_id: checkoutId,
            amount: parseFloat(amount)
          });

        if (dbError) {
          console.error('Database insert error:', dbError);
        } else {
          console.log('Transaction stored in database:', checkoutId);
        }
      } catch (dbErr) {
        console.error('Database error:', dbErr);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Payment initiated successfully',
          data: {
            requestId: checkoutId,
            checkoutRequestId: checkoutId,
            transactionRequestId: checkoutId
          }
        })
      };
    } else {
      console.error('SwiftPay error:', data);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: data.message || 'Payment initiation failed',
          details: data
        })
      };
    }
  } catch (error) {
    console.error('Payment initiation error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Failed to initiate payment',
        error: error.message
      })
    };
  }
};
