package com.cccmbiz.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(exclude = "churchByChurchId")
public class Profile {
    @Id
    @Column(name = "id")            private int id;
    @Column(name = "uid")           private String uid;
    @Column(name = "user_id")       private Integer userId;
    @Column(name = "household_id")  private Integer householdId;
    @Column(name = "added_by")      private Integer addedBy;
    @Column(name = "cn_name")       private String cnName;
    @Column(name = "first_name")    private String firstName;
    @Column(name = "last_name")     private String lastName;
    @Column(name = "sex")           private String sex;
    @Column(name = "birth")         private Integer birth;
    @Column(name = "phone")         private String phone;
    @Column(name = "phone_code")    private Integer phoneCode;
    @Column(name = "phone_verified") private Byte phoneVerified;
    @Column(name = "sms_optout")    private Byte smsOptout;
    @Column(name = "wechat")        private String wechat;
    @Column(name = "address")       private String address;
    @Column(name = "address2")      private String address2;
    @Column(name = "city")          private String city;
    @Column(name = "state")         private String state;
    @Column(name = "country")       private String country;
    @Column(name = "zipcode")       private String zipcode;
    @Column(name = "believe")       private Integer believe;
    @Column(name = "serve")         private Byte serve;
    @Column(name = "status")        private Byte status;
    @Column(name = "note")          private String note;

    @ManyToOne
    @JoinColumn(name = "church_id", referencedColumnName = "id")
    private Church churchByChurchId;
}
