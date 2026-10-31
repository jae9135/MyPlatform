package com.example.shop;

import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

/** 데모용: 일부러 취약하게 작성한 코드입니다. */
public class UserRepository {

    private static final String DB_PASSWORD = "admin1234";

    public boolean login(String userId, String password) throws Exception {
        Connection conn = DriverManager.getConnection("jdbc:postgresql://localhost/shop", "shop", DB_PASSWORD);
        Statement stmt = conn.createStatement();
        String sql = "SELECT * FROM users WHERE user_id = '" + userId + "' AND pw = '" + hash(password) + "'";
        ResultSet rs = stmt.executeQuery(sql);
        boolean ok = rs.next();
        return ok;
    }

    public String hash(String value) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] digest = md.digest(value.getBytes());
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
