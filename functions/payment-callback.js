// Netlify function to handle PesaFlux webhook callbacks
const { supabase } = require('./supabase');

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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse webhook payload
    const payload = JSON.parse(event.body || '{}');

    // Log the webhook data
    console.log('=== PesaFlux Webhook Received ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Validate webhook data
    if (!payload.TransactionID) {
      console.error('Invalid webhook: Missing TransactionID');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          status: 'error',
          message: 'Invalid webhook data' 
        })
      };
    }

    // Extract transaction details
    const {
      ResponseCode,
      ResponseDescription,
      TransactionID,
      TransactionAmount,
      TransactionReceipt,
      TransactionDate,
      TransactionReference,
      Msisdn,
      MerchantRequestID,
      CheckoutRequestID,
    } = payload;

    // Determine status based on response code
    let status = 'failed';
    let statusMessage = ResponseDescription;

    if (ResponseCode === 0) {
      status = 'success';
      statusMessage = 'Payment completed successfully';
    } else if (ResponseCode === 1032 || ResponseCode === 1031 || ResponseCode === 1) {
      status = 'cancelled';
      statusMessage = 'Payment was cancelled by user';
    } else if (ResponseCode === 1037) {
      // Timeout - ignore and keep pending
      console.log('Timeout response received - ignoring webhook');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          status: 'received',
          message: 'Timeout webhook ignored'
        })
      };
    }

    // Parse PesaFlux date format
    let parsedDate = null;
    if (TransactionDate && TransactionDate.length === 14) {
      try {
        const year = TransactionDate.substring(0, 4);
        const month = TransactionDate.substring(4, 6);
        const day = TransactionDate.substring(6, 8);
        const hour = TransactionDate.substring(8, 10);
        const minute = TransactionDate.substring(10, 12);
        const second = TransactionDate.substring(12, 14);
        parsedDate = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
      } catch (dateErr) {
        console.error('Date parsing error:', dateErr);
      }
    }

    // Try to find and update the transaction
    let transaction = null;

    // Try by reference first
    if (TransactionReference) {
      const result = await supabase
        .from('transactions')
        .select('*')
        .eq('reference', TransactionReference)
        .maybeSingle();
      transaction = result.data;
    }

    // Fallback to phone number
    if (!transaction && Msisdn) {
      const result = await supabase
        .from('transactions')
        .select('*')
        .eq('phone', Msisdn)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      transaction = result.data;
    }

    if (transaction) {
      console.log('Found transaction to update:', transaction.id);

      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: status,
          result_code: ResponseCode.toString(),
          result_description: statusMessage,
          receipt_number: TransactionReceipt !== 'N/A' ? TransactionReceipt : null,
          merchant_request_id: MerchantRequestID,
          checkout_request_id: CheckoutRequestID,
          transaction_date: parsedDate,
          transaction_id: TransactionID,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('Database update error:', updateError);
      } else {
        console.log('Transaction updated successfully:', TransactionID, 'Status:', status);
      }
    } else {
      console.error('Transaction not found for webhook');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        status: 'success',
        message: 'Webhook processed successfully'
      })
    };
  } catch (error) {
    console.error('Webhook processing error:', error);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: 'Webhook received but processing failed'
      })
    };
  }
};
