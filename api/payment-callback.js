// Vercel Serverless Function: webhook callback (ported from Netlify function)
const { supabase } = require('../functions/supabase');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const payload = req.body || {};

    if (!payload.TransactionID) {
      res.status(400).json({ status: 'error', message: 'Invalid webhook data' });
      return;
    }

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

    let status = 'failed';
    let statusMessage = ResponseDescription;

    if (ResponseCode === 0) {
      status = 'success';
      statusMessage = 'Payment completed successfully';
    } else if (ResponseCode === 1032 || ResponseCode === 1031 || ResponseCode === 1) {
      status = 'cancelled';
      statusMessage = 'Payment was cancelled by user';
    } else if (ResponseCode === 1037) {
      res.status(200).json({ status: 'received', message: 'Timeout webhook ignored' });
      return;
    }

    let parsedDate = null;
    if (TransactionDate && String(TransactionDate).length === 14) {
      try {
        const dateStr = String(TransactionDate);
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = dateStr.substring(8, 10);
        const minute = dateStr.substring(10, 12);
        const second = dateStr.substring(12, 14);
        parsedDate = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
      } catch (dateErr) {
        console.error('Date parsing error:', dateErr);
      }
    }

    let transaction = null;

    if (TransactionReference) {
      const result = await supabase
        .from('transactions')
        .select('*')
        .eq('reference', TransactionReference)
        .maybeSingle();
      transaction = result.data;
    }

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
      await supabase
        .from('transactions')
        .update({
          status: status,
          result_code: ResponseCode?.toString?.() ?? String(ResponseCode),
          result_description: statusMessage,
          receipt_number: TransactionReceipt !== 'N/A' ? TransactionReceipt : null,
          merchant_request_id: MerchantRequestID,
          checkout_request_id: CheckoutRequestID,
          transaction_date: parsedDate,
          transaction_id: TransactionID,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);
    }

    res.status(200).json({ status: 'success', message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(200).json({ status: 'error', message: 'Webhook received but processing failed' });
  }
};
