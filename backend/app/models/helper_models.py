from pydantic import BaseModel
from typing import List

class MissingIdsRequest(BaseModel):
    document_id: str
    id_name: str
    ids: List[str]