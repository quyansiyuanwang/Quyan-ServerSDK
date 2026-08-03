package main

import (
    "bufio"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "os"
    "strings"
    "time"
)

type config struct {
    OAuthBaseURL    string
    ClientID        string
    ClientSecret    string
    RedirectURI     string
    Scope           string
}

type tokenResponse struct {
    AccessToken      string `json:"access_token"`
    RefreshToken     string `json:"refresh_token"`
    TokenType        string `json:"token_type"`
    Scope            string `json:"scope"`
    ExpiresIn        int    `json:"expires_in"`
    Error            string `json:"error"`
    ErrorDescription string `json:"error_description"`
}

func main() {
    cfg, err := loadConfig()
    if err != nil {
        panic(err)
    }

    codeVerifier, codeChallenge, err := createPKCEPair()
    if err != nil {
        panic(err)
    }

    state, err := randomBase64URL(24)
    if err != nil {
        panic(err)
    }

    fmt.Println("Go OAuth SDK sample ready.")
    fmt.Println("Authorize URL:")
    fmt.Println(createAuthorizeURL(cfg, state, codeChallenge))
    fmt.Println()
    fmt.Println("Persist this PKCE verifier until your callback receives the code:")
    fmt.Println(codeVerifier)
    fmt.Println()
    fmt.Println("Then call exchangeAuthorizationCode(cfg, code, codeVerifier) in your own callback handler.")
}

func createAuthorizeURL(cfg config, state, codeChallenge string) string {
    values := url.Values{}
    values.Set("response_type", "code")
    values.Set("client_id", cfg.ClientID)
    values.Set("redirect_uri", cfg.RedirectURI)
    values.Set("scope", cfg.Scope)
    values.Set("state", state)
    values.Set("code_challenge", codeChallenge)
    values.Set("code_challenge_method", "S256")
    return strings.TrimRight(cfg.OAuthBaseURL, "/") + "/v1/oauth/authorize?" + values.Encode()
}

func exchangeAuthorizationCode(cfg config, code, codeVerifier string) (*tokenResponse, error) {
    body := map[string]string{
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  cfg.RedirectURI,
        "code_verifier": codeVerifier,
    }
    return doTokenRequest(cfg, body)
}

func refreshAccessToken(cfg config, refreshToken string) (*tokenResponse, error) {
    body := map[string]string{
        "grant_type":    "refresh_token",
        "refresh_token": refreshToken,
    }
    return doTokenRequest(cfg, body)
}

func fetchCurrentUser(cfg config, accessToken string) (map[string]any, error) {
    request, err := http.NewRequest(http.MethodGet, strings.TrimRight(cfg.OAuthBaseURL, "/")+"/v1/users/me", nil)
    if err != nil {
        return nil, err
    }
    request.Header.Set("Accept", "application/json")
    request.Header.Set("Authorization", "Bearer "+accessToken)

    client := &http.Client{Timeout: 15 * time.Second}
    response, err := client.Do(request)
    if err != nil {
        return nil, err
    }
    defer response.Body.Close()

    raw, err := io.ReadAll(response.Body)
    if err != nil {
        return nil, err
    }

    if response.StatusCode >= 400 {
        return nil, fmt.Errorf("request failed with status %d: %s", response.StatusCode, string(raw))
    }

    var payload map[string]any
    if err := json.Unmarshal(raw, &payload); err != nil {
        return nil, err
    }
    return payload, nil
}

func doTokenRequest(cfg config, body map[string]string) (*tokenResponse, error) {
    raw, err := json.Marshal(body)
    if err != nil {
        return nil, err
    }

    request, err := http.NewRequest(http.MethodPost, strings.TrimRight(cfg.OAuthBaseURL, "/")+"/v1/oauth/token", strings.NewReader(string(raw)))
    if err != nil {
        return nil, err
    }
    request.Header.Set("Accept", "application/json")
    request.Header.Set("Content-Type", "application/json")
    request.SetBasicAuth(cfg.ClientID, cfg.ClientSecret)

    client := &http.Client{Timeout: 15 * time.Second}
    response, err := client.Do(request)
    if err != nil {
        return nil, err
    }
    defer response.Body.Close()

    responseRaw, err := io.ReadAll(response.Body)
    if err != nil {
        return nil, err
    }

    var payload tokenResponse
    if err := json.Unmarshal(responseRaw, &payload); err != nil {
        return nil, err
    }

    if payload.Error != "" {
        return nil, fmt.Errorf("oauth error: %s", firstNonEmpty(payload.ErrorDescription, payload.Error))
    }

    if response.StatusCode >= 400 {
        return nil, fmt.Errorf("request failed with status %d: %s", response.StatusCode, string(responseRaw))
    }

    return &payload, nil
}

func createPKCEPair() (string, string, error) {
    verifier, err := randomBase64URL(32)
    if err != nil {
        return "", "", err
    }

    digest := sha256.Sum256([]byte(verifier))
    challenge := base64.RawURLEncoding.EncodeToString(digest[:])
    return verifier, challenge, nil
}

func randomBase64URL(size int) (string, error) {
    bytes := make([]byte, size)
    if _, err := rand.Read(bytes); err != nil {
        return "", err
    }
    return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func loadConfig() (config, error) {
    envMap, err := readDotEnv(".env")
    if err != nil && !os.IsNotExist(err) {
        return config{}, err
    }

    cfg := config{
        OAuthBaseURL: requiredValue(envMap, "OAUTH_BASE_URL"),
        ClientID:     requiredValue(envMap, "OAUTH_CLIENT_ID"),
        ClientSecret: requiredValue(envMap, "OAUTH_CLIENT_SECRET"),
        RedirectURI:  requiredValue(envMap, "OAUTH_REDIRECT_URI"),
        Scope:        optionalValue(envMap, "OAUTH_SCOPE", "profile"),
    }

    if cfg.OAuthBaseURL == "" || cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.RedirectURI == "" {
        return config{}, fmt.Errorf("missing required environment variables")
    }

    return cfg, nil
}

func readDotEnv(path string) (map[string]string, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer file.Close()

    values := map[string]string{}
    scanner := bufio.NewScanner(file)
    for scanner.Scan() {
        line := strings.TrimSpace(scanner.Text())
        if line == "" || strings.HasPrefix(line, "#") {
            continue
        }
        parts := strings.SplitN(line, "=", 2)
        if len(parts) != 2 {
            continue
        }
        values[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
    }
    return values, scanner.Err()
}

func requiredValue(envMap map[string]string, key string) string {
    if value := strings.TrimSpace(os.Getenv(key)); value != "" {
        return value
    }
    return strings.TrimSpace(envMap[key])
}

func optionalValue(envMap map[string]string, key, fallback string) string {
    if value := requiredValue(envMap, key); value != "" {
        return value
    }
    return fallback
}

func firstNonEmpty(values ...string) string {
    for _, value := range values {
        if strings.TrimSpace(value) != "" {
            return value
        }
    }
    return "unknown error"
}
