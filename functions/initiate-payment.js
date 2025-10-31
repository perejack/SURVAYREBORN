// Netlify function to initiate PesaFlux STK Push payment
const { supabase } = require('./supabase');

// PesaFlux API credentials
const API_KEY = 'PSFXPCGLCY37';
const EMAIL = 'silverstonesolutions103@gmail.com';

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
    const { phoneNumber, amount = 149, description = 'FARE Account Activation' } = requestBody;
    
    console.log('Parsed request:', { phoneNumber, amount, description });
    
    if (!phoneNumber) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Phone number is required' })
      };
    }
    
    // Generate a unique reference for this payment
    const externalReference = `FARE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Prepare PesaFlux payload
    const pesafluxPayload = {
      api_key: API_KEY,
      email: EMAIL,
      amount: amount.toString(),
      msisdn: phoneNumber,
      reference: externalReference,
      callback_url: 'https://completioncheckou.vercel.app/api/webhook',
    };
    
    console.log('Making API request to PesaFlux');
    
    // Try PesaFlux API endpoint
    const response = await fetch('https://api.pesaflux.co.ke/v1/initiatestk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(pesafluxPayload),
    });

    const responseText = await response.text();
    console.log('PesaFlux response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse PesaFlux response:', responseText);
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
    if (data.success === '200' || data.success === 200) {
      // Store transaction in Supabase
      try {
        const { error: dbError } = await supabase
          .from('transactions')
          .insert({
            transaction_request_id: data.transaction_request_id,
            status: 'pending',
            amount: amount,
            phone: phoneNumber,
            email: EMAIL,
            reference: externalReference,
          });

        if (dbError) {
          console.error('Database insert error:', dbError);
        } else {
          console.log('Transaction stored in database:', data.transaction_request_id);
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
            externalReference: data.transaction_request_id,
            checkoutRequestId: data.transaction_request_id,
            transactionRequestId: data.transaction_request_id
          }
        })
      };
    } else {
      console.error('PesaFlux error:', data);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: data.massage || data.message || 'Payment initiation failed',
          error: data
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
