from collections import OrderedDict
from app.config import settings


class LRUCache:
    def __init__(self, max_size: int = None):
        self.max_size = max_size or settings.CACHE_MAX_SIZE
        self.cache: OrderedDict = OrderedDict()

    def get(self, key: str) -> bytes | None:
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        return None

    def put(self, key: str, value: bytes):
        if key in self.cache:
            self.cache.move_to_end(key)
        else:
            if len(self.cache) >= self.max_size:
                self.cache.popitem(last=False)
        self.cache[key] = value

    def invalidate(self, key: str):
        if key in self.cache:
            del self.cache[key]

    def clear(self):
        self.cache.clear()

    def size(self) -> int:
        return len(self.cache)


# Global singleton cache
chunk_cache = LRUCache()
