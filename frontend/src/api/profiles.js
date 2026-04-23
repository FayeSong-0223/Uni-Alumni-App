import api from './client';

export const getMyProfile = () => api.get('/profiles/me/');

export const updateMyProfile = (data) => api.patch('/profiles/me/', data);

export const searchProfiles = (params) => api.get('/profiles/search/', { params });

export const enhancedSearchProfiles = (params) =>
  api.get('/profiles/search/enhanced/', { params });

export const getAutocompleteSuggestions = (query) =>
  api.get('/profiles/autocomplete/', { params: { q: query } });

export const getCompanyAutocomplete = (query) =>
  api.get('/profiles/autocomplete/companies/', { params: { q: query } });

export const getProfileByAlumniId = (alumniId) =>
  api.get(`/profiles/${alumniId}/`);

// Dropdown dictionary for professional interests (server-seeded)
export const getProfessionalInterestOptions = () =>
  api.get('/profiles/options/professional-interests/');

// Avatar upload (multipart). `file` should be { uri, name, type } on RN or a File on web.
export const uploadAvatar = (file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  return api.post('/profiles/me/avatar/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteAvatar = () => api.delete('/profiles/me/avatar/');
