package cn.qysyw.oauth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.cdimascio.dotenv.Dotenv;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

public final class Main {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Dotenv DOTENV = Dotenv.configure().ignoreIfMissing().load();
    private static final String OAUTH_BASE_URL = requiredEnv("OAUTH_BASE_URL");
    private static final String OAUTH_CLIENT_ID = requiredEnv("OAUTH_CLIENT_ID");
    private static final String OAUTH_CLIENT_SECRET = requiredEnv("OAUTH_CLIENT_SECRET");
    private static final String OAUTH_REDIRECT_URI = requiredEnv("OAUTH_REDIRECT_URI");
    private static final String OAUTH_SCOPE = envOrDefault("OAUTH_SCOPE", "profile");
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private Main() {
    }

    public static void main(String[] args) throws Exception {
        PkcePair pkcePair = createPkcePair();
        String state = UUID.randomUUID().toString();

        System.out.println("Java OAuth SDK sample ready.");
        System.out.println("Authorize URL:");
        System.out.println(createAuthorizeUrl(state, pkcePair.codeChallenge()));
        System.out.println();
        System.out.println("Persist this PKCE verifier until your callback receives the code:");
        System.out.println(pkcePair.codeVerifier());
        System.out.println();
        System.out.println("Then call exchangeAuthorizationCode(code, codeVerifier) in your callback handler.");
    }

    public static PkcePair createPkcePair() throws Exception {
        byte[] verifierBytes = new byte[32];
        RANDOM.nextBytes(verifierBytes);
        String codeVerifier = base64Url(verifierBytes);

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        String codeChallenge = base64Url(digest.digest(codeVerifier.getBytes(StandardCharsets.UTF_8)));
        return new PkcePair(codeVerifier, codeChallenge);
    }

    public static String createAuthorizeUrl(String state, String codeChallenge) {
        return OAUTH_BASE_URL.replaceAll("/+$", "")
                + "/v1/oauth/authorize?response_type=code"
                + "&client_id=" + urlEncode(OAUTH_CLIENT_ID)
                + "&redirect_uri=" + urlEncode(OAUTH_REDIRECT_URI)
                + "&scope=" + urlEncode(OAUTH_SCOPE)
                + "&state=" + urlEncode(state)
                + "&code_challenge=" + urlEncode(codeChallenge)
                + "&code_challenge_method=S256";
    }

    public static JsonNode exchangeAuthorizationCode(String code, String codeVerifier) throws Exception {
        String body = OBJECT_MAPPER.writeValueAsString(new TokenRequest("authorization_code", code, OAUTH_REDIRECT_URI, codeVerifier, null));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(OAUTH_BASE_URL.replaceAll("/+$", "") + "/v1/oauth/token"))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("Authorization", basicAuthHeader())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        return unwrapOAuthResponse(HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString()));
    }

    public static JsonNode refreshAccessToken(String refreshToken) throws Exception {
        String body = OBJECT_MAPPER.writeValueAsString(new TokenRequest("refresh_token", null, null, null, refreshToken));
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(OAUTH_BASE_URL.replaceAll("/+$", "") + "/v1/oauth/token"))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("Authorization", basicAuthHeader())
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        return unwrapOAuthResponse(HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString()));
    }

    public static JsonNode fetchCurrentUser(String accessToken) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(OAUTH_BASE_URL.replaceAll("/+$", "") + "/v1/users/me"))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new RuntimeException("Request failed with status " + response.statusCode() + ": " + response.body());
        }
        return OBJECT_MAPPER.readTree(response.body());
    }

    private static JsonNode unwrapOAuthResponse(HttpResponse<String> response) throws Exception {
        JsonNode payload = OBJECT_MAPPER.readTree(response.body());
        if (payload.hasNonNull("error")) {
            throw new RuntimeException(payload.path("error_description").asText(payload.path("error").asText()));
        }
        if (response.statusCode() >= 400) {
            throw new RuntimeException("Request failed with status " + response.statusCode() + ": " + response.body());
        }
        return payload;
    }

    private static String basicAuthHeader() {
        String credentials = OAUTH_CLIENT_ID + ":" + OAUTH_CLIENT_SECRET;
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String requiredEnv(String key) {
        String value = envOrDefault(key, "").trim();
        if (value.isEmpty()) {
            throw new IllegalStateException("Missing required environment variable: " + key);
        }
        return value;
    }

    private static String envOrDefault(String key, String fallback) {
        String value = DOTENV.get(key);
        if (value == null || value.isBlank()) {
            value = System.getenv(key);
        }
        return value == null || value.isBlank() ? fallback : value;
    }

    public record PkcePair(String codeVerifier, String codeChallenge) {
    }

    public record TokenRequest(
            String grant_type,
            String code,
            String redirect_uri,
            String code_verifier,
            String refresh_token
    ) {
    }
}
