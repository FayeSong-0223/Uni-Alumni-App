import api from './client';

export const sendContactRequest = (toAlumniId, message = '') =>
  api.post('/connections/send/', { to_user_alumni_id: toAlumniId, message });

export const getReceivedRequests = () => api.get('/connections/received/');

export const getSentRequests = () => api.get('/connections/sent/');

export const respondToRequest = (id, status) =>
  api.post(`/connections/${id}/respond/`, { status });

export const getConnections = () => api.get('/connections/list/');
