from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """Page-number pagination: 12 per page, client-tunable up to 100."""

    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 100
