from rest_framework import permissions


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Read operations open to any authenticated user; write operations
    (create / update / destroy / image upload) restricted to staff.

    Per spec: activity images (and by extension activities themselves) are
    admin-authored content. Regular alumni only book activities; they don't
    create or edit them.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_staff)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)
