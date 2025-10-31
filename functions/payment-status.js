// Netlify function to check payment status from Supabase
const { supabase } = require('./supabase');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

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
    // Get reference from path parameter
    const reference = event.path.split('/').pop();
    
    if (!reference) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Payment reference is required' })
      };
    }
    
    console.log('Checking status for reference:', reference);
    
    // Query Supabase for transaction by reference or transaction_request_id
    const { data: transaction, error: dbError } = await supabase
      .from('transactions')
      .select('*')
      .or(`reference.eq.${reference},transaction_request_id.eq.${reference}`)
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
      
      // Map database status to compatible format
      let paymentStatus = 'PENDING';
      if (transaction.status === 'success') {
        paymentStatus = 'SUCCESS';
      } else if (transaction.status === 'failed' || transaction.status === 'cancelled') {
        paymentStatus = 'FAILED';
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
            status: 'PENDING',
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
