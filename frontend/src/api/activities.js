import client from './client';

// -- Listing / CRUD (admin-only create/update/delete on the server) ---------
export const getActivities = (params = {}) => client.get('/activities/', { params });
export const getActivity = (id) => client.get(`/activities/${id}/`);
export const createActivity = (data) => client.post('/activities/', data);
export const updateActivity = (id, data) => client.patch(`/activities/${id}/`, data);
export const deleteActivity = (id) => client.delete(`/activities/${id}/`);

// -- Smart discovery --------------------------------------------------------
// Personalized upcoming feed, sorted by relevance then nearest date.
export const getRecommendedActivities = (params = {}) =>
  client.get('/activities/recommendations/', { params });

// Free-text search with relevance threshold & date filter.
//   q (title/description only), date_from (YYYY-MM-DD), date_to,
//   categories (array — controlled Activity.CATEGORY_CHOICES keys),
//   tags (array — free-form power-user filter, no chip UI).
// Arrays serialise as repeated ?categories=a&categories=b — see the
// paramsSerializer in client.js.
export const searchActivities = (params = {}) =>
  client.get('/activities/search/', { params });

// Discover tab — excludes activities the user has already booked.
// Accepts the same filter params as searchActivities.
export const getDiscoverActivities = (params = {}) =>
  client.get('/activities/discover/', { params });

// Activity-name autocomplete for the search bar (title-only).
export const getActivityAutocomplete = (q) =>
  client.get('/activities/autocomplete/', { params: { q } });

// Available tags across upcoming activities, sorted by frequency.
// No longer powers a chip row (categories replaced that) but kept for any
// future use — e.g. an admin tag-management screen.
// Shape: [{ tag: 'music', count: 12 }, ...]
export const getAvailableTags = () =>
  client.get('/activities/tags/');

// Controlled category taxonomy (one of Activity.CATEGORY_CHOICES) with
// per-category counts of upcoming activities. Powers the category-chip
// filter row on the Activities screen. Zero-count categories are omitted
// by the backend. Shape: [{ key, label, count }, ...]
export const getCategories = () =>
  client.get('/activities/categories/');

// -- Booking ---------------------------------------------------------------
export const bookActivity = (id, bookingData) =>
  client.post(`/activities/${id}/book/`, bookingData);

export const getActivityBookings = (id) => client.get(`/activities/${id}/bookings/`);

export const getUserBookings = (params = {}) => client.get('/bookings/', { params });

// Calendar view: /bookings/calendar/?month=YYYY-MM → { month, days: {date: [bookings]} }
export const getBookedCalendar = (monthStr) =>
  client.get('/bookings/calendar/', { params: { month: monthStr } });

export const updateBooking = (id, data) => client.patch(`/bookings/${id}/`, data);

export const cancelBooking = (activityId) =>
  client.delete(`/activities/${activityId}/cancel_booking/`);

// -- Admin-only image upload -----------------------------------------------
export const uploadActivityImage = (id, file) => {
  const formData = new FormData();
  formData.append('image', file);
  return client.post(`/activities/${id}/image/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
