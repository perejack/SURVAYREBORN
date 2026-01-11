// Vercel Serverless Function: check payment status (and optionally query M-Pesa via proxy)
const { supabase } = require('../../functions/supabase');

const MPESA_PROXY_URL =
  process.env.MPESA_PROXY_URL || 'https://swiftpay-backend-uvv9.onrender.com/api/mpesa-verification-proxy';
const MPESA_PROXY_API_KEY = process.env.MPESA_PROXY_API_KEY || '';

async function queryMpesaPaymentStatus(checkoutId) {
  try {
    const response = await fetch(MPESA_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkoutId: checkoutId,
        apiKey: MPESA_PROXY_API_KEY,
      }),
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error querying M-Pesa via proxy:', error?.message || error);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  try {
    const reference = req.query?.reference;

    if (!reference) {
      res.status(400).json({ success: false, message: 'Payment reference is required' });
      return;
    }

    const { data: transaction, error: dbError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_request_id', reference)
      .maybeSingle();

    if (dbError) {
      res.status(500).json({ success: false, message: 'Error checking payment status' });
      return;
    }

    if (!transaction) {
      res.status(200).json({
        success: true,
        payment: {
          status: 'pending',
          message: 'Payment is still being processed',
        },
      });
      return;
    }

    let paymentStatus = 'pending';
    if (transaction.status === 'success' || transaction.status === 'completed') {
      paymentStatus = 'success';
    } else if (transaction.status === 'failed' || transaction.status === 'cancelled') {
      paymentStatus = 'failed';
    }

    if (paymentStatus === 'pending') {
      try {
        const proxyResponse = await queryMpesaPaymentStatus(transaction.transaction_request_id);
        if (proxyResponse && proxyResponse.success === true) {
          const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'success' })
            .eq('id', transaction.id);

          if (!updateError) {
            paymentStatus = 'success';
          }
        }
      } catch (proxyError) {
        console.error('Error querying M-Pesa via proxy:', proxyError);
      }
    }

    res.status(200).json({
      success: true,
      payment: {
        status: paymentStatus,
        amount: transaction.amount,
        phoneNumber: transaction.phone,
        mpesaReceiptNumber: transaction.receipt_number,
        resultDesc: transaction.result_description,
        resultCode: transaction.result_code,
        timestamp: transaction.updated_at,
      },
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error?.message || String(error),
    });
  }
};
