import os
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional  # noqa: F401


@dataclass(frozen=True)
class OAuthProvider:
    """Immutable descriptor for an OAuth 2.0 provider."""

    name: str
    authorize_url: str
    token_url: str
    user_info_url: str
    scopes: List[str]
    client_id_env: str
    client_secret_env: str
    redirect_uri_env: str
    # Function that receives the raw user-info JSON dict and returns a
    # normalised dict with keys: provider_user_id, email, username, display_name,
    # avatar_url.
    profile_mapper: Optional[Callable[[dict], dict]] = field(default=None)

    # ----- Convenience helpers ------------------------------------------------

    @property
    def client_id(self) -> str:
        return os.environ.get(self.client_id_env, "")

    @property
    def client_secret(self) -> str:
        return os.environ.get(self.client_secret_env, "")

    @property
    def redirect_uri(self) -> str:
        return os.environ.get(self.redirect_uri_env, "")

def _map_42_profile(data: dict) -> dict:
    """
    42 API user-info response → normalised profile dict.

    42 API returns: id, login, email, displayname, image { link, ... }
    Docs: https://api.intra.42.fr/apidoc/2.0/users/me.html
    """
    return {
        "provider_user_id": str(data.get("id", "")),
        "email": data.get("email", ""),
        "username": data.get("login", ""),
        "display_name": data.get("displayname") or data.get("login", ""),
        "avatar_url": (data.get("image") or {}).get("link", ""),
    }


OAUTH_PROVIDERS: Dict[str, OAuthProvider] = {
    "42": OAuthProvider(
        name="42",
        authorize_url="https://api.intra.42.fr/oauth/authorize",
        token_url="https://api.intra.42.fr/oauth/token",
        user_info_url="https://api.intra.42.fr/v2/me",
        scopes=["public"],
        client_id_env="OAUTH_42_CLIENT_ID",
        client_secret_env="OAUTH_42_CLIENT_SECRET",
        redirect_uri_env="OAUTH_42_REDIRECT_URI",
        profile_mapper=_map_42_profile,
    ),
}


def get_provider(name: str) -> OAuthProvider:
    """Return provider config or raise ValueError."""
    provider = OAUTH_PROVIDERS.get(name)
    if provider is None:
        raise ValueError(
            f"Unknown OAuth provider '{name}'. "
            f"Available: {', '.join(OAUTH_PROVIDERS.keys())}"
        )
    return provider
