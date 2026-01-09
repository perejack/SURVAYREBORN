// Netlify function to check payment status from Supabase with M-Pesa verification
const { supabase } = require('./supabase');

const MPESA_PROXY_URL = process.env.MPESA_PROXY_URL || 'https://swiftpay-backend-uvv9.onrender.com/api/mpesa-verification-proxy';
const MPESA_PROXY_API_KEY = process.env.MPESA_PROXY_API_KEY || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

async function queryMpesaPaymentStatus(checkoutId) {
  try {
    console.log(`Querying M-Pesa status for ${checkoutId} via proxy`);
    
    const response = await fetch(MPESA_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checkoutId: checkoutId,
        apiKey: MPESA_PROXY_API_KEY
      })
    });

    if (!response.ok) {
      console.error('Proxy response status:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('Proxy response:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error querying M-Pesa via proxy:', error.message);
    return null;
  }
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    // Get reference from path parameter or query string
    const reference = event.path.split('/').pop() || event.queryStringParameters?.reference;
    
    if (!reference) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Payment reference is required' })
      };
    }
    
    console.log('Checking transaction status in database:', reference);
    
    // Query Supabase for transaction by transaction_request_id
    const { data: transaction, error: dbError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_request_id', reference)
      .maybeSingle();
    
    if (dbError) {
      console.error('Database query error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Error checking payment status'
        })
      };
    }
    
    if (transaction) {
      console.log(`Payment status found for ${reference}:`, transaction);
      
      let paymentStatus = 'pending';
      if (transaction.status === 'success' || transaction.status === 'completed') {
        paymentStatus = 'success';
      } else if (transaction.status === 'failed' || transaction.status === 'cancelled') {
        paymentStatus = 'failed';
      }
      
      if (paymentStatus === 'pending') {
        console.log(`Status is pending, querying M-Pesa via proxy for ${transaction.transaction_request_id}`);
        try {
          const proxyResponse = await queryMpesaPaymentStatus(transaction.transaction_request_id);
          console.log(`Proxy response for ${transaction.transaction_request_id}:`, proxyResponse);
          
          if (proxyResponse && proxyResponse.success === true) {
            console.log(`Proxy confirmed payment success for ${transaction.transaction_request_id}, updating database`);
            
            const { error: updateError } = await supabase
              .from('transactions')
              .update({ status: 'success' })
              .eq('id', transaction.id);
            
            if (!updateError) {
              paymentStatus = 'success';
              console.log(`Transaction ${transaction.transaction_request_id} updated to success`);
            } else {
              console.error('Error updating transaction:', updateError);
            }
          } else {
            console.log(`Proxy did not confirm success. Response:`, proxyResponse);
          }
        } catch (proxyError) {
          console.error('Error querying M-Pesa via proxy:', proxyError);
        }
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          payment: {
            status: paymentStatus,
            amount: transaction.amount,
            phoneNumber: transaction.phone,
            mpesaReceiptNumber: transaction.receipt_number,
            resultDesc: transaction.result_description,
            resultCode: transaction.result_code,
            timestamp: transaction.updated_at
          }
        })
      };
    } else {
      // Payment not found yet (still pending)
      console.log(`Payment status not found for ${reference}, still pending`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          payment: {
            status: 'pending',
            message: 'Payment is still being processed'
          }
        })
      };
    }
  } catch (error) {
    console.error('Payment status check error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Failed to check payment status',
        error: error.message
      })
    };
  }
};
