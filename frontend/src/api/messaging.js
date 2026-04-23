import api from './client';

export const sendMessage = (recipientAlumniId, body) =>
  api.post('/messaging/send/', {
    recipient_alumni_id: recipientAlumniId,
    subject: 'Message', // Default subject for backend compatibility
    body,
  });

export const getInbox = () => api.get('/messaging/inbox/');

export const getSentMessages = () => api.get('/messaging/sent/');

export const getMessageDetail = (id) => api.get(`/messaging/${id}/`);

export const getConversation = (alumniId) =>
  api.get(`/messaging/conversation/${alumniId}/`);
