import os
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional


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


def _map_google_profile(data: dict) -> dict:
    """
    Google userinfo endpoint → normalised profile dict.

    Google People/UserInfo returns: sub, email, name, picture, given_name
    Docs: https://developers.google.com/identity/protocols/oauth2
    """
    return {
        "provider_user_id": data.get("sub", ""),
        "email": data.get("email", ""),
        "username": data.get("email", "").split("@")[0],
        "display_name": data.get("name", ""),
        "avatar_url": data.get("picture", ""),
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
    "google": OAuthProvider(
        name="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        user_info_url="https://www.googleapis.com/oauth2/v3/userinfo",
        scopes=["openid", "email", "profile"],
        client_id_env="OAUTH_GOOGLE_CLIENT_ID",
        client_secret_env="OAUTH_GOOGLE_CLIENT_SECRET",
        redirect_uri_env="OAUTH_GOOGLE_REDIRECT_URI",
        profile_mapper=_map_google_profile,
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
